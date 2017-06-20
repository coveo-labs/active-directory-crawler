# create temp folders
mkdir temp
mkdir temp/users

# delete previous temp files, if any.
rm -f temp/users/*
rm -f temp/batch.json

# TODO: fill in with your own company info.
# The filter here (ou=* Users) will add all the groups ending with ' Users' in the bin/groups.ldif file.
# For example: 'US Users, Europe Users, Canada Users'. Change the filter to suit your need.
ldapsearch -LLL -H ldap://ldaphost.company.com -D "DOMAIN\username" -y ldapUser.password -u -b "ou=MAIN_ORG_UNIT,dc=example,dc=company,dc=com" "(ou=* Users)" > temp/groups.ldif


node crawlAD.js
node pushToSource.js
