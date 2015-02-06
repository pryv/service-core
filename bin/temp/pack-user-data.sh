#!/bin/sh
username=$1

DATAPATH=/var/pryv/data/api-server-files/
DBNAME=pryv-node
UIDLENGTH=24
COLLECTIONS="accesses followedSlices events profile streams"
command="mongo --quiet --eval 'db.users.findOne({username:\"$username\"})._id' $DBNAME"
UUID=$(eval $command)

if [ ${#UUID} -eq $UIDLENGTH ]
then
	echo "ID of $username id $UUID"
else
	echo "Error: Cannot find user: $username"
	exit 0
fi

packfolder=$username
dumpfolder=$packfolder/mongodump
infos=$packfolder/infos.sh
infosjson=$packfolder/infos.json

mongoexport -d $DBNAME -c users -q "{ \"username\" : \"$username\" }" > $infosjson
USERJSON=$(eval $command)

echo "USERNAME=${username}" > $infos
echo "UUID=${UUID}" >> $infos


mkdir -p $packfolder
mkdir -p $dumpfolder

for collection in $COLLECTIONS; do
   mongodump -d $DBNAME -c ${UUID}.${collection} -o $dumpfolder
done

rsync -avz $DATAPATH/attachments/$UUID $packfolder/attachments

tar -cvz $packfolder > $packfolder.tgz
