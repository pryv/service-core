#!/bin/sh

set -e

cd /app/bin/dist/components/previews-server

export NODE_ENV=production
export NODE_PATH=/app/bin/dist/

create_links() {
	remove_links # Remove all existing service, if any
	chmod +x /etc/runit/app/run # make the script executable
	ln -s /etc/runit/app /etc/service/app #make a link to /etc/service (will be run with runit).
}

remove_links() {
	#When removing link from /etc/service Runit will stop the processes
	rm -Rf /etc/service/app
}

case "$1" in 
    start)   create_links ;;
    stop)    remove_links ;;
    restart) create_links ;; # no need to call remove_link, it will be called by create_links
    *) echo "usage: $0 start|stop|restart" >&2
       exit 1
       ;;
esac