const express = require('express');
const cors = require('cors');
const app = express();
const mongoose = require('mongoose');
const authMiddleware = require('./middlewares/auth');
const graphqlMiddleware = require('./middlewares/graphql');

require('dotenv').config();

// eslint-disable-next-line no-undef
mongoose.connect(`mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@${process.env.DB_HOST}/${process.env.DB_NAME}?retryWrites=true&w=majority`);

mongoose.connection.once('open', () => {
    console.log('connected to database');
});

const allowedOrigins = [
    'http://localhost:4200',
    'http://localhost:3000',
    'https://ems-ui-poc.test.humanitarian.tech',
    'https://api-ems-ui-poc.test.humanitarian.tech'
];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1) {
            var msg = 'The CORS policy for this site does not ' +
                'allow access from the specified Origin.';
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    }
}));

app.use(authMiddleware);
app.use('/graphql', graphqlMiddleware);

app.listen(3000, () => {
    console.log('Listening on port 3000');
}); 