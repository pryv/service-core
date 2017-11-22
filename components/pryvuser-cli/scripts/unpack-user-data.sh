#!/bin/sh

# TEMPORARY SCRIPT, kept as reference until the CLI handles account dump & restore

DATAPATH=/var/pryv/data/service-core-files/
DBNAME=pryv-node
UIDLENGTH=24
COLLECTIONS="accesses followedSlices events profile streams"


package=$1

if [ ! -f $package ]
then
	 echo "Cannot find package $1"
	 exit 0
fi
name=$(basename $package .tgz)

echo "---------------------------"
echo "------ unpacking ----------"
echo "---------------------------"
tar -xvf $package


echo "---------------------------"
echo "------ loading infos ------"
echo "---------------------------"
if [ ! -f $name/infos.json ]
then
	echo "Cannot find json information in $name" ; exit 0
fi

. $name/infos.sh

echo "\nQUESTION: Are the information bellow correct Y/y"
echo "USERNAME: $USERNAME"
echo "USERID: $UUID"

read a
if [[ $a != "Y" && $a != "y" ]]; then
  echo "ABORDED"; exit 0
fi

## TESTS
# USERNAME EXISTS?
command="mongo --quiet --eval 'db.users.findOne({username:\"$USERNAME\"})._id' $DBNAME"
XUUID=$(eval $command)
if [ ${#XUUID} -eq $UIDLENGTH ]
then
	echo "Error: $USERNAME is already in this database with id: $XUUID"
	exit 0
else
	echo "Checking $USERNAME : OK"
fi
# UID EXISTS
command="mongo --quiet --eval 'db.users.findOne({_id:\"$UUID\"})._id' $DBNAME"
XUUID=$(eval $command)
if [ ${#XUUID} -eq $UIDLENGTH ]
then
	echo "Error: $UUID is already in this database"
	exit 0
else
	echo "Checking $UUID : OK"
fi

echo "INSERTING USER INTO DB"
mongorestore -d $DBNAME $USERNAME/mongodump/$DBNAME/

echo "ADDING USER INTO DB"
mongoimport -d $DBNAME --collection users --type json --file $USERNAME/infos.json

mv $USERNAME/attachments/$UUID $DATAPATH/attachments/
