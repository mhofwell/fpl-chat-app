# Railway Internal Networking Guide

Connection String Pattern: 

Internal (Railway to Railway Service)

http://<internal_url>:<internal_port>?family=0 
http://fpl-123-server.railway.internal:8080
http://fpl-chat-app.railway.internal:8080/api/cron/sync-fpl/post-match?gameweek=36&type=post-match&source=post-match-cron-schedule&family=0

- Sometimes we might need to append ?family=0. Ex., for connections to the Redis service internally on Railway if we use Redis. 




