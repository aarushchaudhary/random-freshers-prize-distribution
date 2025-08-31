# 🎉 Random Freshers Prize Distribution

A real-time web application for managing and distributing prizes during freshers' events. Built with Node.js, Express, Socket.IO, and MongoDB, this application provides an interactive platform for both students and administrators to participate in prize distributions.

## ✨ Features

### Student Portal
- **Real-time Updates**: Students can view prize distributions as they happen
- **Interactive Interface**: User-friendly design for easy navigation
- **Live Notifications**: Instant updates when prizes are distributed

### Admin Dashboard
- **Prize Management**: Add, edit, and manage prize inventory
- **Random Distribution**: Fair and randomized prize allocation system
- **Real-time Control**: Manage the event flow in real-time
- **Student Management**: View and manage participant lists

## 🚀 Tech Stack

- **Frontend**: HTML, CSS, JavaScript
- **Backend**: Node.js, Express.js
- **Real-time Communication**: Socket.IO
- **Database**: MongoDB
- **Deployment**: Netlify (with serverless functions)

## 📁 Project Structure

```
event-app/
│
├── .gitignore              # Git ignore file
├── netlify.toml           # Netlify configuration
├── package.json           # Project dependencies
├── package-lock.json      # Dependency lock file
├── .env                   # Environment variables (not committed)
│
├── public/                # Frontend files
|   ├── media/            # Media files
│   ├── index.html        # Student Portal
│   ├── admin.html        # Admin Dashboard
│   ├── style.css         # Styling for both pages
│   ├── app.js           # Student Portal JavaScript
|   ├── admin-auth.js    # Admin Authenication JavaScript
│   └── admin.js         # Admin Dashboard JavaScript
│
├── functions/            # Backend serverless functions
│   └── api.js           # Express/Socket.IO backend
│
└── node_modules/        # Dependencies (generated)
```

## 🛠️ Installation

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn
- MongoDB database (local or cloud)

### Setup Steps

1. **Clone the repository**
   ```bash
   git clone https://github.com/aarushchaudhary/random-freshers-prize-distribution.git
   cd random-freshers-prize-distribution/event-app
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   Create a `.env` file in the root directory:
   ```env
   MONGO_URI=your_mongodb_connection_string
   ```

4. **Run locally**
   ```bash
   npm start
   ```
   The application will be available at `http://localhost:3000`

## 🌐 Deployment

### Deploying to Netlify

1. **Fork this repository** to your GitHub account

2. **Connect to Netlify**
   - Log in to [Netlify](https://netlify.com)
   - Click "New site from Git"
   - Choose GitHub and select this repository

3. **Configure build settings**
   - Base directory: `event-app`
   - Build command: `npm install`
   - Publish directory: `event-app/public`

4. **Set environment variables**
   - Go to Site settings → Environment variables
   - Add `MONGO_URI` with your MongoDB connection string

5. **Deploy**
   - Click "Deploy site"
   - Your site will be live at the provided Netlify URL

## 💻 Usage

### For Students
1. Navigate to the main page (`index.html`)
2. Register or log in with your details
3. View available prizes and wait for the distribution
4. Receive real-time notifications when prizes are allocated

### For Administrators
1. Navigate to the admin dashboard (`/admin.html`)
2. Log in with admin credentials
3. Manage prize inventory
4. Start the random distribution process
5. Monitor real-time participant engagement

## 🔧 Configuration

### Netlify Configuration (`netlify.toml`)
The `netlify.toml` file contains:
- Build settings
- Redirect rules for serverless functions
- Environment variable configurations

### Database Schema
The MongoDB database includes collections for:
- **Students**: Participant information
- **Prizes**: Prize details and availability
- **Distributions**: Log of prize allocations

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 👤 Author

**Aarush Chaudhary**
- GitHub: [@aarushchaudhary](https://github.com/aarushchaudhary)

## 🙏 Acknowledgments

- Thanks to all contributors who have helped with this project
- Special thanks to the freshers' committee for the inspiration
- Socket.IO team for the excellent real-time communication library

## 📞 Support

For support, please open an issue in the GitHub repository or contact the maintainer.

---

⭐ If you find this project useful, please consider giving it a star on GitHub!