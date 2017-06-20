module.exports = {
  platform: 'push.cloud.coveo.com',
  org: 'YOUR_COVEO_ORG',
  source: 'YOUR_PUSH_SOURCE_ID',
  pushKey: 'YOUR_KEY',

  ldapHost: 'ldaphost.company.com',
  ldapUser: 'DOMAIN\\username', // User to use when crawling

  ldapMainGroup: 'ou=MAIN_ORG_UNIT,dc=example,dc=company,dc=com',
  //The filter here (ou=* Users) will add all the groups ending with ' Users' in the bin/groups.ldif file.
  //For example: 'US Users, Europe Users, Canada Users'. Change the filter to suit your need.
  ldapGroupFilter: '(ou=* Users)',

  // this is an example only, edit to fit your need. Here, we filter out users from the group 'Guests'.
  ldapUsersFilter: '(&(objectclass=user)(!(memberOf=CN=Guests,OU=COV,DC=corp,DC=coveo,DC=com)))'
};
