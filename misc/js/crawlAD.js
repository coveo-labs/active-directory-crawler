const config = require('../config'),
  fs = require('fs'),
  ldif = require('ldif'),
  User = require('./User'),
  exec = require('child_process').exec;

const TEMP_FOLDER = './temp'; // relative to where 'node crawlAD.js' is executed

/**
 * Creates a user map as a helper to find users by emails or by their DN key.
 */
let userMap = (()=> {
  this._email = {};
  this._dn = {};
  return {
    get: key => {
      return this._email[key] || this._dn[key] || null;
    },
    getAllEmails: ()=>{
      return Object.keys(this._email).sort();
    },
    push: user=> {
      if ( user && user.userPrincipalName && user.dn ) {
        this._email[user.userPrincipalName] = user;
        if (user.mail !== user.userPrincipalName) {
          this._email[user.mail] = user;
        }
        this._dn[user.dn] = user;

        if (user.distinguishedName && user.distinguishedName !== user.dn) {
          this._dn[user.distinguishedName] = user;
        }
      }
    }
  };
})();

/**
 * Reads a LDIF file to get users for one group
 * @param {string} groupFile
 * @param {function} resolve Promise callback
 */
let parseUsersOfAGroupFile = (groupFile, resolve)=> {
  try {
    let parseUsers = ldif.parseFile(groupFile),
      users = [],
      user = null;

    while( (user=parseUsers.shift()) ) {
      user = user.toObject({decode: true});
      if (user.dn === user.attributes.manager || !user.attributes.userPrincipalName) {
        console.log('SKIP: ', user.dn);
      }
      else {
        users.push(user);
      }
    }
    resolve(users);
  }
  catch(e) {
    resolve([]);
  }
};

/**
 * Reads LDIF file ../temp/groups.ldif and query AD to get the users from each sub-group defined in ../temp/groups.ldif
 * @param {string} groupsFile
 * @return {Promise} The promise is resolved once all the groups are processed.
 */
let parseGroupsFile = (groupsFile)=> {
  let file = ldif.parseFile(groupsFile),
    record = null;

  return new Promise((resolve)=>{
    let promises = [],
      execCmd = (cmd, outfile) => {
        promises.push(new Promise(resolve=>{
          exec(cmd, error => {
            if (!error) {
              parseUsersOfAGroupFile(outfile, resolve);
            }
          });
        }));
      };

    while ( (record = file.shift()) ) {
      let o = record.toObject({decode:false}),
        dn = o.dn,
        ou = o.attributes.ou.replace(/\s+/g,'_'),
        outfile = `${TEMP_FOLDER}/${ou}.ldif`;

      let cmd = `ldapsearch -LLL -H ldap://${config.ldapHost} -D "${config.ldapUser}" -y ldapUser.password -u -b "${dn}" '${config.ldapUsersFilter}' > ${outfile}`;
      execCmd(cmd, outfile);
    }

    Promise.all(promises).then(users=>{
      resolve(users);
    });
  });
};

/**
 * Create a User instance from a JSON object
 * @param {object} user
 */
let createUser = (user) => {
  let email = user.userPrincipalName || user.attributes.userPrincipalName;
  if ( userMap.get(email) ) {
    console.log('ERROR ---- already created: ', user.dn, email);
    return userMap.get(email);
  }

  let u = new User(user);
  userMap.push(u);
  return u;
};

/**
 * Helper function to return the email of a users based on it's DN key. Useful for array functions like map().
 * @param {string} dn
 */
let mapEmailToDN = dn=>{
  let u = userMap.get(dn);
  if ( !(u && u.userPrincipalName) ){
    console.log('--- can not find user email for ', dn, u);
  }
  return (u && u.userPrincipalName) || dn;
};

/**
 * Process the LDIF info for all users, after all the groups LDIF files were loaded.
 * @param {object[]} groups
 */
let onAllUsersLoaded = (groups) => {
  groups.forEach(g=>{
    g.forEach( createUser );
  });

  console.log('\n-------  \n Step 2 - users created \n------- \n');

  let userEmails = userMap.getAllEmails().reverse();

  console.log('\n-------  \n Step 3 - processing users \n------- \n');

  let nextUser = () => {
    let userKey = userEmails.pop(),
      adUser = userMap.get(userKey);

    if (adUser) {
      // we want to keep an hierarchy of the managers/direct reports. We are using emails to map them together.
      adUser.managers = adUser.getManagers(userMap);
      if (adUser.managers && adUser.managers.map) {
        adUser.managers = adUser.managers.map( mapEmailToDN );
        let managerUser = userMap.get( adUser.managers[0] );
        if (managerUser) {
          adUser.admanagername = managerUser.name;
        }
      }

      if (adUser.directReports && !adUser.directReports.map) {
        adUser.directReports = [adUser.directReports]; // in case we have one report only, it could be a string and not an array.
      }
      if (adUser.directReports && adUser.directReports.map) {
        adUser.directReports = adUser.directReports.map( mapEmailToDN );
      }

      let whenCreated = adUser.whenCreated;
      if ( /^(\d\d\d\d)(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)/.test(whenCreated) ) {
        adUser.createdDate = new Date( Date.UTC(RegExp.$1,parseInt(RegExp.$2,10)-1,RegExp.$3,RegExp.$4,RegExp.$5,RegExp.$6) ).toISOString();
      }
      adUser.filetype = 'activedirperson';

      // clean up some unused fields
      let reKeysToDelete = /^(thumbnailPhoto|mSMQ|msExch|msRTC)/;
      Object.keys(adUser).forEach(k=>{
        if ( reKeysToDelete.test(k) ) {
          delete adUser[k];
        }
      });

      try {
        let fileName = adUser.userPrincipalName.replace(/[^\w]/g, '_');
        fs.writeFileSync(`${TEMP_FOLDER}/users/${fileName}.json`, JSON.stringify(adUser, null, 2), 'utf-8');
      }
      catch(e) {}

      nextUser();
    }
    else {
      // 'adUser' is undefined, means we reach the end of the users to process.
      let mapfile = `${TEMP_FOLDER}/user_map.json`;
      console.log('Done. Writing map to ', mapfile);

      let keys = userMap.getAllEmails();
      let map = {};
      keys.forEach( userEmail => {
        let adUser = userMap.get(userEmail);
        map[userEmail] = {
          displayName: adUser.displayName,
          dn: adUser.dn,
          key: userEmail
        };
      });

      try {
        fs.writeFileSync(mapfile, JSON.stringify(map,null,2), err=>{console.log(err);});
      }
      catch(e) {}
    }
  };

  nextUser();
};

let main = () => {
  console.log('\n-------  \n Step 1 - loading info from Active Directory \n------- \n');
  parseGroupsFile(`${TEMP_FOLDER}/groups.ldif`).then( onAllUsersLoaded );
};

main();
