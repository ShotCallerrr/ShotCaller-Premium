const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());
app.use(express.static('../frontend')); // serve the frontend

mongoose.connect('mongodb://localhost:27017/shotcaller', { useNewUrlParser: true, useUnifiedTopology: true });

const UserSchema = new mongoose.Schema({
  username: String,
  password: String, // In production: hash passwords!
  balance: Number,
  role: String
});
const BetSchema = new mongoose.Schema({
  username: String,
  matchId: String,
  team: String,
  amount: Number,
  odds: Number,
  settled: Boolean,
  win: Boolean,
  placedAt: Date
});
const User = mongoose.model('User', UserSchema);
const Bet = mongoose.model('Bet', BetSchema);

// Preload demo users if not exist
const initUsers = async () => {
  const count = await User.countDocuments();
  if (!count) {
    await User.create([
      { username: 'user1', password: 'pass1', balance: 1000, role: 'user' },
      { username: 'demo', password: 'demo', balance: 500, role: 'user' },
      { username: 'admin', password: 'admin123', balance: 0, role: 'admin' }
    ]);
  }
};
initUsers();

app.post('/api/login', async (req, res) => {
  const {username, password} = req.body;
  const user = await User.findOne({ username, password });
  if (!user) return res.json({ success: false, message: 'Invalid login' });
  return res.json({ success: true, user: { username: user.username, role: user.role }, balance: user.balance });
});

app.post('/api/bet', async (req, res) => {
  const { username, matchId, team, amount } = req.body;
  const user = await User.findOne({ username });
  if (!user) return res.json({ success: false, message: 'User not found' });
  const MIN_BET = 10, MAX_BET = 200, ODDS = 1.9;
  if (amount < MIN_BET || amount > MAX_BET) return res.json({ success: false, message: 'Invalid bet amount' });
  if (user.balance < amount) return res.json({ success: false, message: 'Insufficient balance' });

  user.balance -= amount;
  await user.save();

  await Bet.create({ username, matchId, team, amount, odds: ODDS, settled: false, win: null, placedAt: new Date() });

  const bets = await Bet.find({ username });
  return res.json({ success: true, balance: user.balance, bets });
});

// Admin endpoint to settle bets
app.post('/api/settle', async (req, res) => {
  const { matchId, winner } = req.body;
  const bets = await Bet.find({ matchId, settled: false });
  for (const bet of bets) {
    bet.settled = true;
    bet.win = (bet.team === winner);
    await bet.save();

    if (bet.win) {
      const user = await User.findOne({ username: bet.username });
      const payout = bet.amount * bet.odds;
      user.balance += payout;
      await user.save();
    }
  }
  res.json({ success: true, settled: bets.length });
});

const PORT = 3000;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
