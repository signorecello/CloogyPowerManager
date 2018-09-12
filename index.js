const express = require ('express')
const app = express()
const powermanager = require ('./dev/powermanager.js')
const port = process.env.PORT
const actuators = require ('./dev/actuators')
var http = require ('http'); // for the buffer request

app.get('/start', function (req, res) {
    res.json('Power manager starting (check console).')
    powermanager
    res.end()
})

app.get('/', function (req,res) {
    res.json('Power manager running (check console).')
})

setInterval(function() {
    http.get("http://cloogypm.herokuapp.com/");
}, 300000); // every 5 minutes (300000)


app.listen(port, function() {
    console.log(`Listening on port ${port}`)
})