#!/bin/sh

set -e

cd /app/bin/dist/components/hfs-server

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
export NODE_PATH=/app/bin/dist/

create_links() {
	# cleanup all existing services, if any
	remove_links

	for i in $( seq 1 $num_procs )
	do
		port=$((starting_port + i - 1))
		cp -R /etc/runit/app /etc/runit/app_$i
		chmod +x /etc/runit/app_$i/run
		# replace port number with current port in the duplicated script
		sed -i "s/\${PORT_NUM}/$port/g" /etc/runit/app_$i/run
		ln -s /etc/runit/app_$i /etc/service/app_$i
	done

	chmod +x /etc/runit/metadata/run
	ln -s /etc/runit/metadata /etc/service/metadata

	# remove link to this script in /etc/service so it will be run only once at container startup
	rm -Rf /etc/service/runit
}

remove_links() {
	rm -Rf /etc/service/app_*

	# when removing link from /etc/service, Runit will stop the processes
	rm -Rf /etc/runit/app_*
	rm -f /etc/service/metadata
}

case "$1" in
	start)
		create_links
		;;
	stop)
		remove_links
		;;
	*)
		echo "No parameters (or wrong one). Creating links with 'start'"
		create_links
		;;
esac
