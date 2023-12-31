// Express Server
const express = require('express')
const app = express()

// socket.io
const socketio = require('socket.io')
const server = require('http').createServer(app)
const io = socketio(server)

// Load keys
const keys = require('./config/keys')

// MongoDB database
const mongoose = require('mongoose')

// Database Connection
mongoose.connect(keys.mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})

mongoose.set('useCreateIndex', true);

// lodash
const lodash = require('lodash/array')


// cors
var cors = require('cors')
app.use(cors())

// Add headers
app.use(function (req, res, next) {

  // Website you wish to allow to connect
  res.setHeader('Access-Control-Allow-Origin', 'https://ufaz-love-letter.herokuapp.com/');

  // Request methods you wish to allow
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');

  // Request headers you wish to allow
  res.setHeader('Access-Control-Allow-Headers', 'Origin,X-Requested-With,Content-Type,Accept,content-type,application/json');

  // Set to true if you need the website to include cookies in the requests sent
  // to the API (e.g. in case you use sessions)
  res.setHeader('Access-Control-Allow-Credentials', true);

  // Pass to next layer of middleware
  next();
});

// Built-in node package for working with file and directory paths
const path = require('path')

// Static public directory
app.use(express.static(path.join(__dirname, 'public')))

// Handlebars
const exphbs = require('express-handlebars')

// Handlebars middleware
app.engine('handlebars', exphbs());
app.set('view engine', 'handlebars')

const bodyParser = require("body-parser")

// bodyParser middleware
app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.json())

const methodOverride = require('method-override')

// Method Override middleware
app.use(methodOverride('_method'))


// Set global vars
app.use((req, res, next) => {
  res.locals.user = req.user || null
  next()
})

const port = process.env.PORT || 4000

const morgan = require('morgan')
const fs = require('fs')
// create a write stream (in append mode)
var accessLogStream = fs.createWriteStream(path.join(__dirname, 'access.log'), { flags: 'a' })

app.use(morgan('combined', { stream: accessLogStream }))

morgan(function (tokens, req, res) {
  return [
    tokens.method(req, res),
    tokens.url(req, res),
    tokens.status(req, res),
    tokens.res(req, res, 'content-length'), '-',
    tokens['response-time'](req, res), 'ms'
  ].join(' ')
})

morgan(':method :host :status :res[content-length] - :response-time ms');

// Routes
const db = require('./routes/db')
app.use(db)

// Models
const Cards = require('./models/Cards')


// Helper functions
const { randomNumber,
  shuffleCards,
  discardCard,
  findCardIndex,
  findPlayerIndex,
  findLobby,
  findCard,
  findCredentials,
  findOwner,
  nextPlayer,
  roundWinner,
  checkCondition,
  checkScores } = require('./utils/utils')

const newUser = require('./helpers/newUser')
const drawCard = require('./helpers/drawCard')

// Main route
app.get('/', function (req, res) {
  res.sendFile('index.html');
});

// Global variable to hold all the lobbies
let rooms = []

// TCP connection
io.on('connection', function (socket) {
  console.log('a user connected', socket.id);
  // Adding player to the lobby
  socket.on('new-user', newUser)


  socket.on('drawCard', room => {
    const { event, lobby } = drawCard(room)
    io.to(room).emit(event, lobby)
  })

  socket.on('drawAll', room => {
    let lobby = findLobby(rooms, room)
    if (lobby.players.length == parseInt(lobby.numberOfPlayers)) {
      for (let i = 0; i <= lobby.players.length - 1; i++) {
        lobby.players[i].cardsOnHand.push(lobby.cards.gameCards[0])
        lobby.cards.gameCards.splice(0, 1)
      }
      socket.join(room)
      io.to(room).emit('drawAllReady', lobby)
    } else {
      io.to(room).emit('throwError', 103)
    }
  })


  socket.on('discardCard', (room, card) => {
    let { lobby, player, playerIndex } = findCredentials(rooms, room, socket.id)
    let discardcard = findCard(player.cardsOnHand, card)

    lobby.players[playerIndex] = discardCard(player, discardcard)
    lobby.players[playerIndex].hisTurn = false
    if (lobby.cards.gameCards.length > 0) {
      let nextPlayer = lobby.players.find(player => player.isOutOfRound == false && player.nickname !== lobby.players[playerIndex].nickname)
      let nextPlayerIndex = findPlayerIndex(nextPlayer.nickname, lobby.players)
      lobby.players[nextPlayerIndex].hisTurn = true
      lobby.players[nextPlayerIndex].cardsOnHand.push(lobby.cards.gameCards[0])
      lobby.cards.gameCards.splice(0, 1)
      io.to(room).emit('discardedCardReady', lobby)
    } else {
      let { lobby: winnerLobby, winner } = roundWinner(lobby)
      let result = checkScores(winnerLobby)
      if (result) {
        io.to(room).emit('gameOver', winnerLobby, winner)
      } else {
        io.to(room).emit('roundOver', winnerLobby, winner)
      }
    }

  })


  socket.on('guard', (room, guess, playerAttacked) => {
    let { lobby, player: playerAttacking, playerIndex: playerAttackingIndex } = findCredentials(rooms, room, socket.id)
    let playerAttackedIndex = findPlayerIndex(playerAttacked.nickname, lobby.players)
    let matched = false
    if (lobby.players[playerAttackedIndex].cardsOnHand[0].card === guess) {
      lobby.players[playerAttackedIndex].isOutOfRound = true
      lobby.numberOfPlayersInRound--
      lobby.players[playerAttackedIndex] = discardCard(lobby.players[playerAttackedIndex], playerAttacked.cardsOnHand[0])
      matched = true
    }
    let card = findCard(playerAttacking.cardsOnHand, "Guard")

    lobby.game.playerAttacked = lobby.players[playerAttackedIndex].nickname
    lobby.game.playerAttacking = lobby.players[playerAttackingIndex].nickname
    lobby.game.cardPlayer = "Guard"

    lobby.players[playerAttackingIndex] = discardCard(lobby.players[playerAttackingIndex], card)
    lobby.players[playerAttackingIndex].hisTurn = false
    lobby.players[playerAttackingIndex].isProtected = false

    let { nextLobby, nextIndex, result } = nextPlayer(lobby, playerAttacking)
    let { winner, lobbyCondition, event } = checkCondition(nextLobby, nextIndex, result, 'guard')
    socket.join(room)
    io.in(room).emit(event, lobbyCondition, matched, winner)

  })


  socket.on('priest', (room, playerAttacked) => {
    let { lobby, player, playerIndex: index } = findCredentials(rooms, room, socket.id)
    let card = findCard(player.cardsOnHand, "Priest")
    let playerAttackedIndex = findPlayerIndex(playerAttacked.nickname, lobby.players)

    lobby.game.playerAttacked = lobby.players[playerAttackedIndex].nickname
    lobby.game.playerAttacking = lobby.players[index].nickname
    lobby.game.cardPlayer = "Priest"


    lobby.players[index] = discardCard(lobby.players[index], card)
    lobby.players[index].hisTurn = false
    lobby.players[index].isProtected = false

    let { nextLobby, nextIndex, result } = nextPlayer(lobby, lobby.players[index])
    let { winner, lobbyCondition, event } = checkCondition(nextLobby, nextIndex, result, 'priest')
    io.in(room).emit(event, lobbyCondition, lobby.players[playerAttackedIndex].cardsOnHand[0], winner)
  })



  socket.on('baron', (room, playerAttacked) => {
    let { lobby, player, playerIndex: playerAttackingIndex } = findCredentials(rooms, room, socket.id)
    let playerAttackedIndex = findPlayerIndex(playerAttacked.nickname, lobby.players)
    let otherCard = player.cardsOnHand.find(card => card.card !== "Baron")

    if (otherCard === undefined) {
      otherCard = lobby.players[playerAttackingIndex].cardsOnHand[0]
    }

    if (otherCard.strength > playerAttacked.cardsOnHand[0].strength) {
      lobby.players[playerAttackedIndex].isOutOfRound = true
      lobby.players[playerAttackedIndex] = discardCard(lobby.players[playerAttackedIndex], playerAttacked.cardsOnHand[0])
      lobby.numberOfPlayersInRound--
    } else if (otherCard.strength < playerAttacked.cardsOnHand[0].strength) {
      lobby.players[playerAttackingIndex].isOutOfRound = true
      lobby.players[playerAttackingIndex] = discardCard(lobby.players[playerAttackingIndex], otherCard)
      lobby.numberOfPlayersInRound--
    }

    let card = findCard(player.cardsOnHand, "Baron")

    lobby.game.playerAttacked = lobby.players[playerAttackedIndex].nickname
    lobby.game.playerAttacking = lobby.players[playerAttackingIndex].nickname
    lobby.game.cardPlayer = "Baron"


    lobby.players[playerAttackingIndex] = discardCard(lobby.players[playerAttackingIndex], card)
    lobby.players[playerAttackingIndex].hisTurn = false
    lobby.players[playerAttackingIndex].isProtected = false

    let { nextLobby, nextIndex, result } = nextPlayer(lobby, player)
    let { winner, lobbyCondition, event } = checkCondition(nextLobby, nextIndex, result, 'baron')
    io.to(room).emit(event, lobbyCondition, winner)
  })


  socket.on('handmaid', room => {
    let { lobby, player, playerIndex: index } = findCredentials(rooms, room, socket.id)
    let card = findCard(player.cardsOnHand, "Handmaid")


    lobby.game.playerAttacking = lobby.players[index].nickname
    lobby.game.playerAttacked = ""
    lobby.game.cardPlayer = "Handmaid"

    lobby.players[index].isProtected = true
    lobby.players[index] = discardCard(lobby.players[index], card)
    lobby.players[index].hisTurn = false

    let { nextLobby, nextIndex, result } = nextPlayer(lobby, player)
    let { winner, lobbyCondition, event } = checkCondition(nextLobby, nextIndex, result, 'handmaid')
    io.to(room).emit(event, lobbyCondition, winner)
  })



  socket.on('prince', (room, playerAttacked) => {
    let { lobby, player, playerIndex: playerAttackingIndex } = findCredentials(rooms, room, socket.id)
    let playerAttackedIndex = findPlayerIndex(playerAttacked.nickname, lobby.players)
    let discardingCard = playerAttacked.cardsOnHand[0]
    lobby.players[playerAttackedIndex] = discardCard(lobby.players[playerAttackedIndex], discardingCard)

    if (discardingCard.card === "Princess") {
      lobby.players[playerAttackedIndex].isOutOfRound = true
      lobby.numberOfPlayersInRound--
    } else {
      if (lobby.cards.gameCards.length > 0) {
        lobby.players[playerAttackedIndex].cardsOnHand.push(lobby.cards.gameCards[0])
        lobby.cards.gameCards.splice(0, 1)
      } else {
        lobby.players[playerAttackedIndex].cardsOnHand.push(lobby.cards.discardedCards[0])
        lobby.cards.discardedCards.splice(0, 1)
      }
    }
    let card = findCard(player.cardsOnHand, "Prince")

    lobby.game.playerAttacked = lobby.players[playerAttackedIndex].nickname
    lobby.game.playerAttacking = lobby.players[playerAttackingIndex].nickname
    lobby.game.cardPlayer = "Prince"

    lobby.players[playerAttackingIndex] = discardCard(lobby.players[playerAttackingIndex], card)
    lobby.players[playerAttackingIndex].hisTurn = false
    lobby.players[playerAttackingIndex].isProtected = false
    let { nextLobby, nextIndex, result } = nextPlayer(lobby, player)
    let { winner, lobbyCondition, event } = checkCondition(nextLobby, nextIndex, result, 'prince')
    io.to(room).emit(event, lobbyCondition, winner)
  })


  socket.on('king', (room, playerAttacked) => {
    let { lobby, player, playerIndex } = findCredentials(rooms, room, socket.id)
    let otherCard = player.cardsOnHand.find(card => card.card !== "King")
    let otherCardIndex = findCardIndex(player.cardsOnHand, otherCard.card)
    let playerAttackedIndex = findPlayerIndex(playerAttacked.nickname, lobby.players)

    player.cardsOnHand[otherCardIndex] = lobby.players[playerAttackedIndex].cardsOnHand[0]
    lobby.players[playerAttackedIndex].cardsOnHand[0] = otherCard

    let card = findCard(player.cardsOnHand, "King")

    lobby.game.playerAttacked = lobby.players[playerAttackedIndex].nickname
    lobby.game.playerAttacking = lobby.players[playerIndex].nickname
    lobby.game.cardPlayer = "King"

    lobby.players[playerIndex] = discardCard(player, card)
    lobby.players[playerIndex].hisTurn = false
    lobby.players[playerIndex].isProtected = false

    let { nextLobby, nextIndex, result } = nextPlayer(lobby, player)
    let { winner, lobbyCondition, event } = checkCondition(nextLobby, nextIndex, result, 'king')
    io.to(room).emit(event, lobbyCondition, winner)
  })


  socket.on('countess', room => {
    let { lobby, player, playerIndex } = findCredentials(rooms, room, socket.id)
    let card = findCard(player.cardsOnHand, "Countess")

    lobby.game.playerAttacking = lobby.players[playerIndex].nickname
    lobby.game.playerAttacked = ""
    lobby.game.cardPlayer = "Countess"

    lobby.players[playerIndex] = discardCard(player, card)
    lobby.players[playerIndex].hisTurn = false
    lobby.players[playerIndex].isProtected = false
    let { nextLobby, nextIndex, result } = nextPlayer(lobby, player)
    let { winner, lobbyCondition, event } = checkCondition(nextLobby, nextIndex, result, 'countess')
    io.to(room).emit(event, lobbyCondition, winner)
  })


  socket.on('princess', room => {
    let { lobby, player, playerIndex } = findCredentials(rooms, room, socket.id)

    lobby.game.playerAttacking = lobby.players[playerIndex].nickname
    lobby.game.playerAttacked = ""
    lobby.game.cardPlayer = "Princess"

    for (let i = 0; i < 2; i++) {
      lobby.players[playerIndex] = discardCard(lobby.players[playerIndex], lobby.players[playerIndex].cardsOnHand[0])
    }
    lobby.players[playerIndex].isOutOfRound = true
    lobby.players[playerIndex].hisTurn = false
    lobby.players[playerIndex].isProtected = false
    lobby.numberOfPlayersInRound--
    let { nextLobby, nextIndex, result } = nextPlayer(lobby, player)
    let { winner, lobbyCondition, event } = checkCondition(nextLobby, nextIndex, result, 'princess')
    io.to(room).emit(event, lobbyCondition, winner)
  })


  socket.on('reset', async room => {
    let lobby = findLobby(rooms, room)
    let deck = await Cards.find({})
    deck = shuffleCards(deck)
    let discardedCards = []
    if (lobby.numberOfPlayers == "4") {
      let rand = randomNumber(deck.length)
      discardedCards.push(deck[rand])
      deck.splice(rand, 1)
    } else if (lobby.numberOfPlayers == "3") {
      let rand = randomNumber(deck.length)
      discardedCards.push(deck[rand])
      deck.splice(rand, 1)
    } else if (lobby.numberOfPlayers == "2") {
      for (let i = 0; i < 3; i++) {
        let rand = randomNumber(deck.length)
        discardedCards.push(deck[rand])
        deck.splice(rand, 1)
      }
    }

    lobby.players.forEach(player => {
      player.isOutOfRound = false
      player.cardsOnHand = []
      player.cardsDiscarded = []
      player.isProtected = false
    })

    lobby.numberOfPlayersInRound = parseInt(lobby.numberOfPlayers)
    lobby.cards.discardedCards = discardedCards
    lobby.cards.gameCards = deck
    lobby.currentRound++
    let winner = findOwner(lobby.players)
    let winnerIndex = findPlayerIndex(winner.nickname, lobby.players)
    lobby.players[winnerIndex].hisTurn = true
    io.to(room).emit('resetReady', lobby)
  })


  io.emit('allRooms', rooms)
  socket.on('getPlayers', lobbyName => {
    const players = getUsersInRoom(lobbyName)
    io.emit('players', players)
  })



  socket.on('disconnect', () => {
    console.log(`User disconnected ${socket.id}`)
  });
});




server.listen(port, () => {
  console.log(`Server is up on ${port}`);
});
