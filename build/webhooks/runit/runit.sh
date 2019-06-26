#!/bin/bash

set -e

export NODE_ENV=production
export NODE_PATH=/app/bin/dist/

create_links() {

	remove_links # Remove all existing service, if any

	chmod +x /etc/runit/app/run # make the script executable
	ln -s /etc/runit/app /etc/service/app #make a link to /etc/service (will be run with runit).

	chmod +x /etc/runit/gnats/run # make the script executable
	ln -s /etc/runit/gnats /etc/service/gnats #make a link to /etc/service (will be run with runit).

	rm -Rf /etc/service/runit # Remove link to this script in /etc/service so it will be run only once at container startup
}

remove_links() {
	rm -Rf /etc/service/app

	#When removing link from /etc/service Runit will stop the processes
	rm -f /etc/service/gnats
}

case "$1" in 
    start)   create_links ;;
    stop)    remove_links ;;
    restart) create_links ;; # no need to call remove_link, it will be called by create_links
    *)       echo "No parameters (or wrong one). Launching migration and creating links with 'start'"
		         create_links ;;
esac