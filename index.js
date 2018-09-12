const express = require ('express')
const app = express()
const powermanager = require ('./dev/powermanager.js')
const port = process.env.PORT
const actuators = require ('./dev/actuators')

app.get('/', function (req, res) {
    res.json('Power manager running (check console).')
    powermanager
    res.end()
})

setInterval(function() {
    http.get("http://cloogypm.herokuapp.com/");
}, 300000); // every 5 minutes (300000)


app.listen(port, function() {
    console.log(`Listening on port ${port}`)
})