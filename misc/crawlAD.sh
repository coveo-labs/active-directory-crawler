# create temp folders
mkdir temp
mkdir temp/users

# delete previous temp files, if any.
rm -f temp/users/*
rm -f temp/batch.json

node js/createConfigForBash.js
source temp/config.sh

ldapsearch -LLL -H ldap://$ldapHost -D "$ldapUser" -y ldapUser.password -u -b "$ldapMainGroup" "$ldapGroupFilter" > temp/groups.ldif

node js/crawlAD.js
node js/pushToSource.js

rm -f temp/config.sh
