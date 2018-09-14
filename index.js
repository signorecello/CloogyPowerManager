const express = require ('express')
const app = express()
const powermanager = require ('./dev/powermanager.js')
const port = process.env.PORT
var http = require ('http'); // for the buffer request
const chalk = require ('chalk')

app.get('/', function (req, res) {
    res.json('Power manager starting (check console).')
    //powermanager.powerManager('firstBoot')
    res.end()
})

/*app.get('/ping', function (req,res) {
    res.json('Welcome to Cloogy Power Manager.')
    res.end()
})*/

setInterval(function() {
    http.get("http://cloogypm.herokuapp.com/");
}, 10000); // every 5 minutes (300000)


app.listen(port, function() {
    console.log(chalk.cyan(`Listening on port ${port}`))
})