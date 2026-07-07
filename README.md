- any password, or dependencies refer .env
- two files == depan (frontned) and server (backend)
- the way it works:
- production lines send data to backend via http, then the node js : 1. save data to database 2. send data to react ( only if saving to database is successful )
- server  - server.js is the main server files, functions.js are functions to create/insert data into database, class.js is for the object creating

-how it works pt2 :
-when node js send data to react js, it saves the data into existing object, every production line that is visible in react is based on the existing object,
-to add or remove object/production lines, just refer to file depan/src/pages/dashboard.jsx, the line PORT KLANG LINES AND SENDAYAN LINES are the objects,
-just add new or remove it, exp: ["ABB4", "ABB7", "ABB2","NEWLINE"]; - every row would have 4 line max  per row in the website display

-for database access:
-refer .env in control center vscode

-for raspberry pi / port setup / nodered notes:
-refer DEPLOYMENT.md
