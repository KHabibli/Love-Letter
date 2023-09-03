const newUser = async (room, nickname, number) => {
    // Player object
    let newPlayer = {
        id: socket.id,
        nickname,
        cardsOnHand: [],
        cardsDiscarded: [],
        hisTurn: false,
        isDoingMove: false,
        isOutOfRound: false,
        isProtected: false,
        isOwner: false,
        roundsWon: 0
    }
    let status
    // Looking for the lobby
    let lobby = findLobby(rooms, room)
    // Checking whether the lobby to-be-created has already been created or not
    if (lobby && number !== null) {
        io.to(socket.id).emit('throwError', 101)
        return
    }
    // Checking if lobby exist or not
    if (lobby) {
        let index = rooms.indexOf(lobby)
        // Checking if lobby is full or not
        if (rooms[index].isFull == false) {
            // Checking if the nickname of the player is in use or not
            if (rooms[index].players.some(player => player.nickname === nickname)) {
                io.to(socket.id).emit('throwError', 200)
            } else {
                rooms[index].players.push(newPlayer)
                lobby = rooms[index]
                status = "existed"
                socket.join(room)
                // Checking with final addition if lobby is fulled or not
                if (rooms[index].players.length == parseInt(rooms[index].numberOfPlayers)) {
                    rooms[index].isFull = true
                }
                // Returning a response with data of a lobby and a player
                io.to(room).emit('send-first-message', newPlayer, lobby, status, rooms)
            }
        } else {
            io.to(socket.id).emit('throwError', 100)
        }
        // Checking if the user is trying to create the lobby or joining it 
    } else if (number !== null) {
        let deck = await Cards.find({})

        let distinctCards = lodash.uniqBy(deck, "strength")
        distinctCards.sort((a, b) => a.strength - b.strength)
        distinctCards.shift()

        let discardedCards = []
        let goal
        deck = shuffleCards(deck)
        // Getting cards ready for 4-player game
        if (number == 4) {
            goal = 4
            let rand = randomNumber(deck.length)
            discardedCards.push(deck[rand])
            deck.splice(rand, 1)
            // Getting cards ready for 3-player game
        } else if (number == 3) {
            goal = 5
            let rand = randomNumber(deck.length)
            discardedCards.push(deck[rand])
            deck.splice(rand, 1)
            // Getting cards ready for 2-player game
        } else if (number == 2) {
            goal = 7
            for (let i = 0; i < 3; i++) {
                let rand = randomNumber(deck.length)
                discardedCards.push(deck[rand])
                deck.splice(rand, 1)
            }
        }
        newPlayer.hisTurn = true
        newPlayer.isOwner = true
        // Creating new lobby
        let newRoom = {
            room,
            goal,
            isFull: false,
            currentRound: 1,
            numberOfPlayersInRound: parseInt(number),
            numberOfPlayers: number,
            players: [newPlayer],
            game: {
                playerAttacking: "",
                playerAttacked: "",
                cardPlayer: ""
            },
            cards: {
                gameCards: deck,
                discardedCards,
                distinctCards,
            }
        }
        lobby = newRoom
        status = "new"
        rooms.push(newRoom)
        socket.join(room)
        io.to(room).emit('send-first-message', newPlayer, lobby, status, rooms)
    } else {
        io.to(socket.id).emit('throwError', 102)
    }
}

module.exports = newUser