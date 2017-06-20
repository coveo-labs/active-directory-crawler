const config = require('../config'),
  fs = require('fs'),
  request = require('request');

const TEMP_FOLDER = './temp'; // relative to where 'node pushToSource.js' is executed

// 1. Construct the batch file
let buildBatchFile = (path, jsonFiles) => {
  let files = jsonFiles
    .map(f=>{
      // read each .json file and parse its JSON
      return JSON.parse( fs.readFileSync(path + f) );
    })
    .filter(doc=>{
      if (!doc.mailNickname) {
        console.log('filter out: ', (doc.dn || doc) );
      }
      // filter out documents without the wWWHomePage (we use that as the DocumentId)
      return doc.mailNickname || false;
    })
    .map(doc=> {
      doc.DocumentId = `LDAP://${config.ldapHost}/` + doc.dn;
      doc.jobTitle = doc.title;
      doc.title = doc.displayName;
      doc.date = doc.createdDate;
      doc.mail = doc.userPrincipalName || doc.mail;
      return doc;
    });

  try {
    fs.writeFileSync(`${TEMP_FOLDER}/batch.json`, JSON.stringify(files,null,2), err=>{console.log(err);});
  } catch (e){}

  return {AddOrUpdate: files};
};


/**
 * Send a request to the Push API. Just need to set the action and the method.
 * @param method {String} a HTTP verb
 * @param action {String} can be an absolute url or an action after /sources/sourceName/... for the Push Api.
 * @returns Promise
 */
let sendPushApiRequest = (method, action) => {
  let url =  /^http/.test(action) ? action :  `https://${config.platform}/v1/organizations/${config.org}/sources/${config.source}/${action}`;
  return new Promise((resolve, reject)=>{
    request({
        method: method,
        url: url,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + config.pushKey
        }
      },
      (err,httpResponse,body)=>{
        if (!err) {
          resolve(body);
        }
        else {
          reject(err);
        }
      });
  });
};

let changeSourceStatus = (statusType) => {
  return sendPushApiRequest(`POST`, `status?statusType=${statusType}`);
};

// 4. Send request to process the BATCH
let sendBatchRequest = (fileId) => {

  console.log('\n-------  \n Sending Push request \n------- \n');

  // Send PUT https://push.cloud.coveo.com/v1/organizations/${config.org}/sources/${config.source}/documents/batch?fileId=myfileid
  let now = Date.now(),
    olderThanThreshold = now - (2.2 * 86400000); //delete documents older than about 50 hours, 86400000 is one day (24*60*60*1000)
  return sendPushApiRequest(`PUT`, `documents/batch?fileId=${fileId}&orderingId=${now}`).then( ()=>{
    changeSourceStatus('IDLE').then( ()=>{
      // Delete old documents (remove users that aren't in AD anymore from the Coveo Organization)
      return sendPushApiRequest(`DELETE`, `documents/olderthan?orderingId=${olderThanThreshold}`);
    });
  });
};

// 3. Upload the batch file to AWS
let sendBatchFileToAWS = (uploadUri, fileId, batchFile) => {
  console.log('\n-------  \n Uploading batch.json to Amazon S3 \n------- \n');
  request.put({
    url: uploadUri,
    headers: {
      'Content-Type': 'application/octet-stream',
      'x-amz-server-side-encryption': 'AES256'
    },
    body: JSON.stringify(batchFile)
  },
  (err,httpResponse)=>{
    if (!err && httpResponse.statusCode === 200) {
      sendBatchRequest(fileId);
    }
  });
};

let getLargeFileContainer = (batchFile)=> {
  console.log('\n-------  \n Getting file container \n------- \n');

  // 2. Send POST request to get a large file container (uploadUri and fileId).
  return sendPushApiRequest(`POST`, `https://${config.platform}/v1/organizations/${config.org}/files`).then(
    body=>{
      let resp = JSON.parse(body);
      // 3. Upload the batch file to AWS
      // 4. Send request to process the BATCH
      sendBatchFileToAWS(resp.uploadUri, resp.fileId, batchFile);
    }
  );
};


let main = () => {
  console.log(`\n-------  \n Loading .json files from ${TEMP_FOLDER}/users \n------- \n`);

  let path = `${TEMP_FOLDER}/users/`;
  fs.readdir(path, (err,items)=> {
    let jsonFiles = items.filter(item=> {
      if ( /\.json$/.test(item) ) {
        let stats = fs.statSync(path + item);
        return stats.isFile();
      }
      return false;
    });

    console.log('\n-------  \n Prepare batch.json \n------- \n');
    // 1. Construct the batch file
    let batchFile = buildBatchFile(path, jsonFiles);

    changeSourceStatus('REBUILD').then( ()=>{
      getLargeFileContainer(batchFile);
    });
  });
};

main();
