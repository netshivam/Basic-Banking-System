const express = require('express')
const bodyParser = require('body-parser')
const fs = require('fs')
const mysql = require('mysql2')
const config = require('./config')

const PORT = process.env.PORT || 3000

const app = express()
const db = mysql.createConnection(config)

app.use(express.static('client'))
app.use(bodyParser.urlencoded({ extended: true }))
app.set('view engine', 'ejs')
app.set('views', __dirname + '/client')

// Fetch all customers
app.get('/customers', (_, res) => {
  db.query('SELECT * FROM users', (err, customers) => {
    res.render('customers.ejs', { customers })
  })
})

// Create a new customer with the provided information
app.post('/create', (req, res) => {
  const { email, fullname, balance } = req.body
  db.execute(
    'INSERT INTO users (email, fullname, balance) VALUES (?, ?, ?);',
    [email, fullname, balance],
    (err) => {
      if (!err) res.redirect('/customers', 201)
      else {
        console.error(err)
        res.redirect('/error.html')
      }
    },
  )
})

app.post('/transfer', async (req, res) => {
  const { sender, receiver, amount } = req.body

  // Check if emails exist
  db.execute(
    'SELECT * FROM users WHERE email=? OR email=?',
    [sender, receiver],
    (err, results) => {
      if (err) res.sendStatus(500)
      if (results.length !== 2) {
        res.render('error', { reason: 'Sender or receiver does not exist.' })
        return
      }

      // Transfer balance from sender to receiver
      db.beginTransaction((err) => {
        db.query(
          'SELECT * FROM users WHERE email=?',
          [sender],
          (_, senderRecord) => {
            if (senderRecord[0]['balance'] < amount) {
              res.render('error', {
                reason: 'Insufficient balance, failed transaction.',
              })
              db.rollback()
              return
            } else {
              db.execute(
                `UPDATE users SET balance=balance-? WHERE email=?`,
                [amount, sender],
                () => {
                  db.execute(
                    'UPDATE users SET balance=balance+? WHERE email=?',
                    [amount, receiver],
                    (err) => {
                      if (err) {
                        res.render('error', {
                          reason:
                            'Cannot update balance - ' + JSON.stringify(err),
                        })
                        db.rollback()
                      } else {
                        // Create a transaction record
                        db.execute(
                          'INSERT INTO transactions (sender, receiver, amount, date) VALUES (?, ?, ?, ?)',
                          [
                            sender,
                            receiver,
                            amount,
                            new Date()
                              .toISOString()
                              .slice(0, 19)
                              .replace('T', ' '),
                          ],
                          (err) => {
                            if (err) {
                              res.render('error', {
                                reason:
                                  'Unable to create TX: ' + JSON.stringify(err),
                              })
                              db.rollback()
                            } else {
                              db.commit()
                              res.redirect('/customers')
                            }
                          },
                        )
                      }
                    },
                  )
                },
              )
            }
          },
        )
      })
    },
  )
})

app.get('/history', (_, res) => {
  db.query('SELECT * FROM transactions', (err, txs) => {
    res.render('history', { txs })
  })
})

app.listen(PORT, () => {
  console.log(`[INFO] Running at ${PORT}`)
})
