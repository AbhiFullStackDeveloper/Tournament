const express = require("express"),
    mongoose = require("mongoose"),
    bodyParser = require("body-parser");
const passport = require('passport');
const session = require("express-session");
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const Razorpay = require('razorpay');
const dotenv = require("dotenv");

const User = require("./model/User");
const Tournament = require("./model/Tournament");
const Transaction = require("./model/Transaction");

let app = express();
mongoose.connect('mongodb://localhost:27017/playhiveDB');
mongoose.connection.once('open', () => console.log('Connected to MongoDB'));

// Initialize Razorpay
const razorpay = new Razorpay({
    key_id: 'rzp_test_YOUR_KEY_HERE', // Replace with your Razorpay Key ID
    key_secret: 'YOUR_SECRET_KEY_HERE' // Replace with your Razorpay Secret Key
});

// Session configuration
app.use(session({
    secret: "playhive-secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 3600000, // 1 hour
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true
    }
}));

app.use(passport.initialize());
app.use(passport.session());
app.set("view engine", "ejs");
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));

// Middleware to make user data available to all templates
app.use((req, res, next) => {
    res.locals.currentUser = req.session.user;
    next();
});

// Home route
app.get("/", function (req, res) {
    res.render("home");
});

// Tournament route
app.get("/tournament", isLoggedIn, function (req, res) {
    res.render('tournament', { username: req.session.user.username });
});

// About route
app.get("/about", function (req, res) {
    res.render("about");
});

// Contact route
app.get("/contact", isLoggedIn, function (req, res) {
    res.render("contact");
});

// Leaderboard route
app.get("/leaderboard", isLoggedIn, function (req, res) {
    res.render("leaderboard");
});

// Secret route
app.get("/secret", isLoggedIn, function (req, res) {
    res.render("secret");
});

// Registration routes
app.get("/register", function (req, res) {
    res.render("register");
});

app.post("/register", async (req, res) => {
    try {
        // Check if user already exists
        const existingUser = await User.findOne({ 
            $or: [
                { username: req.body.username },
                { email: req.body.email }
            ]
        });

        if (existingUser) {
            return res.render("register", { 
                error: "Username or email already exists",
                formData: req.body
            });
        }

        // Create new user
        const user = await User.create({
            username: req.body.username,
            password: req.body.password, // Will be hashed by the pre-save hook
            fname: req.body.fname,
            lname: req.body.lname,
            gameid: req.body.gameid,
            gamename: req.body.gamename,
            email: req.body.email,
            phone: req.body.phone
        });

        // Set up session
        req.session.user = {
            id: user._id,
            username: user.username,
        };

        return res.redirect('/tournament');
    } catch (error) {
        console.error('Registration error:', error);
        return res.render("register", { 
            error: "Registration failed. Please try again.",
            formData: req.body
        });
    }
});

// Login routes
app.get("/login", function (req, res) {
    res.render("login");
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    
    try {
        // Find user by username
        const user = await User.findOne({ username });
        
        if (!user) {
            return res.render('login', { error: 'Invalid username or password' });
        }
        
        // Verify password
        const isMatch = await user.comparePassword(password);
        
        if (!isMatch) {
            return res.render('login', { error: 'Invalid username or password' });
        }
        
        // Set up session
        req.session.user = {
            id: user._id,
            username: user.username,
        };
        
        // Redirect to home page
        return res.redirect('/');
        
    } catch (error) {
        console.error('Login error:', error);
        return res.render('login', { error: 'An error occurred during login. Please try again.' });
    }
});

// Join tournament routes
app.get("/join", isLoggedIn, function (req, res) {
    res.render("join");
});

// Create Razorpay order
app.post('/create-order', isLoggedIn, async (req, res) => {
    try {
        const { amount, tournamentId, tournamentName } = req.body;
        
        // Create a Razorpay order
        const options = {
            amount: amount * 100, // amount in paise
            currency: 'INR',
            receipt: `receipt_${Date.now()}`,
            notes: {
                tournamentId: tournamentId,
                tournamentName: tournamentName,
                userId: req.session.user.id,
                username: req.session.user.username
            }
        };
        
        const order = await razorpay.orders.create(options);
        
        res.json({
            success: true,
            order: order
        });
    } catch (error) {
        console.error('Order creation error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create order'
        });
    }
});

// Payment verification route
app.post('/verify-payment', isLoggedIn, async (req, res) => {
    try {
        const { paymentId, orderId, signature, tournamentId, tournamentName, amount } = req.body;
        
        // In a production environment, you would verify the payment signature here
        // using your Razorpay secret key and the signature provided
        
        // Create a new transaction record
        const transaction = await Transaction.create({
            userId: req.session.user.id,
            username: req.session.user.username,
            tournamentId: tournamentId,
            tournamentName: tournamentName,
            amount: amount,
            paymentId: paymentId,
            orderId: orderId,
            status: 'completed',
            paymentMethod: 'razorpay'
        });
        
        // Register the user for the tournament
        const tournament = await Tournament.create({
            tname: tournamentId,
            username: req.session.user.username,
        });
        
        return res.json({ success: true, message: 'Payment verified successfully' });
    } catch (error) {
        console.error('Payment verification error:', error);
        return res.status(500).json({ success: false, message: 'Payment verification failed' });
    }
});

// Transaction history route
app.get('/transactions', isLoggedIn, async (req, res) => {
    try {
        const transactions = await Transaction.find({ userId: req.session.user.id })
            .sort({ createdAt: -1 });
        
        res.render('transactions', { transactions });
    } catch (error) {
        console.error('Error fetching transactions:', error);
        res.status(500).send('Failed to fetch transaction history');
    }
});

// Logout route
app.get("/logout", function (req, res) {
    req.session.destroy(err => {
        if (err) {
            console.error('Logout error:', err);
            return res.redirect('/');
        }
        res.redirect('/');
    });
});

// Authentication middleware
function isLoggedIn(req, res, next) {
    if (req.session && req.session.user) {
        return next();
    }
    res.redirect('/login');
}

require("dotenv").config();
//const express = require("express");
//const bodyParser = require("body-parser");
//const cors = require("cors");
//const { Configuration, OpenAIApi } = require("openai");

//const app = express();
//const PORT = 3000;

// Middleware
/*app.use(bodyParser.json());
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.set("view engine", "ejs");
app.use(express.static("public"));

// OpenAI API Configuration
const openai = new OpenAIApi(
  new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
  })
);

// Home Route (Renders Chat UI)
app.get("/", (req, res) => {
  res.render("index");
});

// Chat API Route (Handles User Messages)
app.post("/chat", async (req, res) => {
  try {
    const { message } = req.body;

    // Send user message to OpenAI API
    const response = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: message }],
    });

    res.json({ reply: response.data.choices[0].message.content });
  } catch (error) {
    console.error("Error in AI response:", error);
    res.status(500).json({ error: "Error generating response" });
  }
});
*/


// Start server
let port = process.env.PORT || 3000;
app.listen(port, function () {
    console.log("Server Has Started! at http://localhost:3000");
});

