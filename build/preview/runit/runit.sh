#!/bin/sh

set -e

cd /app/bin/dist/components/previews-server

export NODE_ENV=production
export NODE_PATH=/app/bin/dist/

create_links() {
	remove_links # Remove all existing service, if any
	chmod +x /etc/runit/app/run # make the script executable
	ln -s /etc/runit/app /etc/service/app #make a link to /etc/service (will be run with runit).

	rm -Rf /etc/service/runit # Remove link to this script in /etc/service so it will be run only once at container startup
}

remove_links() {
	#When removing link from /etc/service Runit will stop the processes
	rm -Rf /etc/service/app
}

case "$1" in 
    start)   create_links ;;
    stop)    remove_links ;;
	*)       echo "No parameters (or wrong one). Creating links with 'start'"
             create_links ;; # To be run even without parameter
esac