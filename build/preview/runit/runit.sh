#!/bin/sh

set -e

cd /app/bin/dist/components/previews-server

export NODE_ENV=production
export NODE_PATH=/app/bin/dist/

create_links() {
	# cleanup all existing services, if any
	remove_links
	chmod +x /etc/runit/app/run
	ln -s /etc/runit/app /etc/service/app

	# remove link to this script in /etc/service so it will be run only once at container startup
	rm -Rf /etc/service/runit
}

remove_links() {
	# when removing link from /etc/service, Runit will stop the processes
	rm -Rf /etc/service/app
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
