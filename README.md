# active-directory-crawler
A tool to retrieve users info from an Active Directory and push them into a Coveo organization.

## How it works

The tool goes through these steps:
1. query the Active Directory with `ldapsearch` for the groups you want to add to your Coveo organization.
1. query the AD for each users in these groups, saving their info as .json files under `temp/`.
1. collect all the .json files for the users, and create one `batch.json`.
4. upload (push) the `batch.json` to the Coveo organization using the Coveo Push API.


## Dependencies
You need to have these softwares installed:

* [__Node.js__](https://nodejs.org/en/) and these npm packages:
    * fs
    * ldif - this package reads ldapsearch output and puts it in a json object
    * request
    * require
* ldapsearch (_Mac_ or _Linux_, should have it by default)
* [__cygwin__](https://cygwin.com/install.html) (_Windows_), use `setup-x86_64.exe`. Required for running bash scripts and using ldapsearch. Make sure to include these packages:
    * `Net / libopenldap_2_4_2`
    * `Net / openldap`
    * `Net / openldap-server`

## How to build

1. Download code from [github](https://github.com/coveo-labs/active-directory-crawler)
1. Open a terminal and move to the `[root]/active-directory-crawler/misc` folder.
1. Run `npm install` to install Node dependencies
1. Set up `ldapUser.password` with the password of the user you will use to query the Active Directory with ldapsearch.
   * It's easier and safer to create a file with the password it.
   * Just make sure you edit its file properties so only you can see its content (`chmod 400`) or through File properties on Windows.
   * Is used by crawlAD.js also
1. Edit config in `config.js`, set all your keys and LDAP info.


## How to run
1. Run `./crawlAd.sh`

## Available documentation

* Push API Reference https://developers.coveo.com/display/CloudPlatform/Push+API+Reference
* Push API Swagger page https://platform.cloud.coveo.com/docs?api=PushApi

## Authors
- Jérôme Devost (https://github.com/jdevost)
