const express = require('express');
const passport = require('passport');
const SteamStrategy = require('passport-steam').Strategy;
const DiscordStrategy = require('passport-discord').Strategy;
const jwt = require('jsonwebtoken');
const User = require('./models/User'); // 你的 User model

const router = express.Router();

// -------------------
// Passport Strategies
// -------------------

// Steam
passport.use(new SteamStrategy({
    returnURL: 'http://localhost:5000/auth/steam/return',
    realm: 'http://localhost:5000/',
    apiKey: process.env.STEAM_API_KEY,
}, (identifier, profile, done) => {
    done(null, profile);
}));

// Discord
passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: 'http://localhost:5000/auth/discord/return',
    scope: ['identify'],
}, (accessToken, refreshToken, profile, done) => {
    done(null, profile);
}));

// -------------------
// Routes
// -------------------

// Steam OAuth trigger
router.get('/auth/steam', (req, res, next) => {
    req.token = req.query.token; // 前端帶 JWT token
    passport.authenticate('steam', { session: false })(req, res, next);
});

// Steam callback
router.get('/auth/steam/return', passport.authenticate('steam', { session: false }), async (req, res) => {
    try {
        const profile = req.user;
        const payload = jwt.verify(req.token, process.env.JWT_SECRET);
        const user = await User.findById(payload.id);
        if (!user) throw new Error('User not found');

        user.steamId = profile.id;
        user.steamName = profile.displayName || profile.username;
        await user.save();

        res.send(`
            <script>
                window.opener.postMessage({
                    bind: 'success',
                    type: 'Steam',
                    steamName: '${user.steamName}'
                }, '*');
                window.close();
            </script>
        `);
    } catch (err) {
        res.send(`
            <script>
                window.opener.postMessage({
                    bind: 'fail',
                    type: 'Steam',
                    error: '${err.message}'
                }, '*');
                window.close();
            </script>
        `);
    }
});

// Discord OAuth trigger
router.get('/auth/discord', (req, res, next) => {
    req.token = req.query.token; // 前端帶 JWT token
    passport.authenticate('discord', { session: false })(req, res, next);
});

// Discord callback
router.get('/auth/discord/return', passport.authenticate('discord', { session: false }), async (req, res) => {
    try {
        const profile = req.user;
        const payload = jwt.verify(req.token, process.env.JWT_SECRET);
        const user = await User.findByPk(payload.id);
        if (!user) throw new Error('User not found');

        user.discordId = profile.id;
        user.discordName = profile.username;
        await user.save();

        res.send(`
            <script>
                window.opener.postMessage({
                    bind: 'success',
                    type: 'Discord',
                    discordName: '${user.discordName}'
                }, '*');
                window.close();
            </script>
        `);
    } catch (err) {
        res.send(`
            <script>
                window.opener.postMessage({
                    bind: 'fail',
                    type: 'Discord',
                    error: '${err.message}'
                }, '*');
                window.close();
            </script>
        `);
    }
});

module.exports = router;
