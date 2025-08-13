event-app/
│
├── .gitignore          # Tells Git which files to ignore (e.g., node_modules, .env)
├── netlify.toml        # Netlify's configuration file for builds and redirects
├── package.json        # Lists project dependencies and scripts
├── package-lock.json   # Records exact dependency versions
└── .env                # Stores your secret MONGO_URI locally (DO NOT commit to Git)
│
├── public/             # 📂 Frontend files (served directly to the user)
│   ├── index.html      # HTML for the Student Portal
│   ├── admin.html      # HTML for the Admin Dashboard
│   ├── style.css       # CSS for styling both pages
│   ├── app.js          # JavaScript for the Student Portal (index.html)
│   └── admin.js        # JavaScript for the Admin Dashboard (admin.html)
│
├── functions/          # 📂 Backend serverless function code
│   └── api.js          # Your single Node.js/Express/Socket.IO backend file
│
└── node_modules/       # 📂 All project dependencies (created by 'npm install')