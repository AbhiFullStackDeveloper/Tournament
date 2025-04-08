// Filename - model/User.js

const mongoose = require('mongoose')
const bcrypt = require('bcrypt')

mongoose.connect('mongodb://localhost:27017/playhiveDB').then(() => 
    {
    console.log('Connection Established for User');
}).catch(err => {
    console.error('Database connection error: In User', err);
});
//const passportLocalMongoose = require('passport-local-mongoose');
var UserSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    password: {
        type: String,
        required: true
    },
    fname: {
        type: String,
        required: true
    },
    lname: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email address']
    },
    phone: {
        type: Number,
        required: true
    },
    gamename: {
        type: String,
        required: true
    },
    gameid: {
        type: Number,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
})

// Hash password before saving
UserSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Method to compare passwords
UserSchema.methods.comparePassword = async function(candidatePassword) {
    try {
        return await bcrypt.compare(candidatePassword, this.password);
    } catch (error) {
        throw error;
    }
};

//User.plugin(passportLocalMongoose);

module.exports = mongoose.model('users', UserSchema)

//module.exports= mongoose.model('User', User, 'users'); // 'users' is the collection name


