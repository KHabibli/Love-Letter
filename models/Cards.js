const mongoose = require('mongoose')

const CardSchema = new mongoose.Schema({
    card: {
        type: String,
        required: true
    },
    strength: {
        type: Number,
        required: true
    },
    description: {
        type: String,
        required: true
    }
})

const Card = mongoose.model("Cards", CardSchema)

module.exports = Card
