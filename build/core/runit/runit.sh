#!/bin/bash

set -e

# Sets $num_procs to 2 or the value of $NUM_PROCS, if set.
if [ -z ${NUM_PROCS+x} ]
then
	num_procs=2
else
	num_procs=$NUM_PROCS
fi

# Sets $starting_port to 3000 or the value of $STARTING_PORT, if set.
if [ -z ${STARTING_PORT+x} ]
then
	starting_port=3000
else
	starting_port=$STARTING_PORT
fi

export NODE_ENV=production
export NODE_PATH=/app/bin/

migrate_db() {
	pushd /app/bin/components/api-server
	chpst -u app ./bin/migrate --config /app/conf/core.yml
	popd
}

create_links() {
	# cleanup all existing services, if any
	remove_links

	for i in $( seq 1 $num_procs )
	do
		port=$((starting_port + i - 1))
		cp -R /etc/runit/app /etc/runit/app_$i
		# replace port number with current port in the duplicated script
		sed -i "s/\${PORT_NUM}/$port/g" /etc/runit/app_$i/run
		chmod +x /etc/runit/app_$i/run
		ln -s /etc/runit/app_$i /etc/service/app_$i
	done

	# remove link to this script in /etc/service so it will be run only once at container startup
	rm -Rf /etc/service/runit
}

create_nats_link() {
	# cleanup existing service, if any
	rm -Rf /etc/service/gnats

	chmod +x /etc/runit/gnats/run
	ln -s /etc/runit/gnats /etc/service/gnats
}

remove_links() {
	rm -Rf /etc/service/app_*

	# when removing link from /etc/service, Runit will stop the processes
	rm -Rf /etc/runit/app_*
	rm -Rf /etc/service/gnats
}

case "$1" in
	start)
		create_nats_link
		create_links
		;;
	stop)
		remove_links
		;;
	restart)
		create_nats_link
		create_links # no need to call remove_link, it will be called by create_links
		;;
	migrate)
		migrate_db
		;;
	*)
		echo "No parameters (or wrong one). Launching migration and creating links with 'start'…"
		create_nats_link
		migrate_db
		create_links
		;;
esac
