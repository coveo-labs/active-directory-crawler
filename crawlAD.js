const config = require('../config'),
  fs = require('fs'),
  ldif = require('ldif'),
  User = require('./User'),
  exec = require('child_process').exec;

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

// Return a promise. The promise is resolved once all the groups are processed.

/**
 * reads temp/groups.ldif and query AD to get the users from each group
 * @param {string} groupsFile
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
        outfile = `./temp/${ou}.ldif`;

      let cmd = `ldap://${config.ldapHost} -D "${config.ldapUser}" -y ldapUser.password -u -b "${dn}" "${config.ldapUsersFilter}" > ${outfile}`;

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

let mapEmailToDN = dn=>{
  let u = userMap.get(dn);
  if ( !(u && u.userPrincipalName) ){
    console.log('--- can not find user email for ', dn, u);
  }
  return (u && u.userPrincipalName) || dn;
};

let onAllUsersLoaded = (groups) => {
  console.log('\n ------  \n Step 1 - loading groups \n------- \n');
  groups.forEach(g=>{
    g.forEach( createUser );
  });

  console.log('\n ------  \n Step 2 - users created \n------- \n');

  let userEmails = userMap.getAllEmails().reverse();

  console.log('\n ------  \n Step 3 - processing users \n------- \n');

  let nextUser = () => {
    let userKey = userEmails.pop(),
      u = userMap.get(userKey);

    console.log(userKey);

    if (u) {
      // we want to keep an hierarchy of the managers/direct reports. We are using emails to map them together.
      u.managers = u.getManagers(userMap);
      if (u.managers && u.managers.map) {
        u.managers = u.managers.map( mapEmailToDN );
        let managerUser = userMap.get( u.managers[0] );
        if (managerUser) {
          u.admanagername = managerUser.name;
        }
      }

      if (u.directReports && !u.directReports.map) {
        u.directReports = [u.directReports]; // in case we have one report only, it could be a string and not an array.
      }
      if (u.directReports && u.directReports.map) {
        u.directReports = u.directReports.map( mapEmailToDN );
      }

      let whenCreated = u.whenCreated;
      if ( /^(\d\d\d\d)(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)/.test(whenCreated) ) {
        u.createdDate = new Date( Date.UTC(RegExp.$1,parseInt(RegExp.$2,10)-1,RegExp.$3,RegExp.$4,RegExp.$5,RegExp.$6) ).toISOString();
      }
      u.filetype = 'activedirperson';

      // clean up some unused fields
      let reKeysToDelete = /^(thumbnailPhoto|mSMQ|msExch|msRTC)/;
      Object.keys(u).forEach(k=>{
        if ( reKeysToDelete.test(k) ) {
          delete u[k];
        }
      });
    }
    else {
      // 'u' is undefined, means we reach the end of the users to process.
      let mapfile = `./temp/user_map.json`;
      console.log('Done. Writing map to ', mapfile);

      let keys = userMap.getAllEmails();
      let map = {};
      keys.forEach( k=> {
        let u = userMap.get(k);
        map[k] = {
          displayName: u.displayName,
          dn: u.dn,
          emailHash: u.emailHash,
          key: k
        };
      });

      try {
        fs.writeFile(mapfile, JSON.stringify(map,null,2), err=>{console.log(err);});
      }
      catch(e) {}
    }
  };

  nextUser();
};

let main = () => {
  console.log('Get info from AD.', new Date().toLocaleTimeString('en-US',{hour12:false}));
  parseGroupsFile('./temp/groups.ldif').then( onAllUsersLoaded );
};

main();
