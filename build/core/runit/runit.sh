#!/bin/bash

set -e

# Sets $num_procs to 2 or the value of $NUM_PROCS, if set.
if [ -z ${NUM_PROCS+x} ]
then
	num_procs=2
else
	num_procs=$NUM_PROCS
fi

export NODE_ENV=production
export NODE_PATH=/app/bin/dist/

# Migrate storage
migrate_db() {
	pushd /app/bin/dist/components/api-server
	chpst -u app ./bin/migrate --config /app/conf/core.json
	popd
}

create_links() {
	remove_links # Remove all existing service, if any

	starting_port=3000 #Hardcoded for now
	for i in $( seq 1 $num_procs ) #create as many app as needed
	do
		port=$((starting_port + i - 1)) #increment port number
		cp -R /etc/runit/app /etc/runit/app_$i #duplicate app script.
		sed -i "s/#PORT_NUM/$port/g" /etc/runit/app_$i/run #replace port number with current port in the duplicated script
		chmod +x /etc/runit/app_$i/run # make the script executable
		ln -s /etc/runit/app_$i /etc/service/app_$i #make a link to /etc/service (will be run with runit).
	done

	chmod +x /etc/runit/gnats/run # make the script executable
	ln -s /etc/runit/gnats /etc/service/gnats #make a link to /etc/service (will be run with runit).

	rm -Rf /etc/service/runit # Remove link to this script in /etc/service so it will be run only once at container startup
}

remove_links() {
	rm -Rf /etc/service/app_*

	#When removing link from /etc/service Runit will stop the processes
	rm -Rf /etc/runit/app_*
	rm -f /etc/service/gnats
}

case "$1" in 
    start)   create_links ;;
    stop)    remove_links ;;
    restart) create_links ;; # no need to call remove_link, it will be called by create_links
		migrate) migrate_db   ;;
    *)       echo "No parameters (or wrong one). Launching migration and creating links with 'start'"
						 migrate_db
		         create_links ;;
esac