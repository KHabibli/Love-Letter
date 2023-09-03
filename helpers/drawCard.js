const drawCard = room => {
    let { lobby, playerIndex } = findCredentials(rooms, room, socket.id)
    if (lobby.cards.gameCards.length == 0) {
        let { lobby: roundLobby, winner: roundWinnerPlayer } = roundWinner(lobby)
        if (roundWinnerPlayer.roundsWon == lobby.goal) {
            return {
                event: 'gameOver',
                lobby: roundLobby
            }
        } else {
            return {
                event: 'roundOver',
                lobby: roundLobby
            }
        }
    } else {
        let cardDrawing = lobby.cards.gameCards[0]
        lobby.players[playerIndex].cardsOnHand.push(cardDrawing)
        lobby.cards.gameCards.splice(0, 1)
        return {
            event: 'drawnCardReady',
            lobby
        }
    }
}

module.exports = drawCard