const baseURI = 'https://api.cloogy.com/api/1.4';
const request = require ('request-promise');
const chalk = require ('chalk')

// async function to get our tokens
async function getToken() {
    const requestOptions = {
        uri: baseURI + '/sessions',
        method: 'POST',
        body: {
            "Login": process.env.LOGIN,
            "Password": process.env.PASSWORD
        },
        json: true
    };

    try {
        const response = await request(requestOptions)
        return response.Token
    }
    catch (error) {
        console.log(chalk.redBright.bold.underline(`Error (request token): ${error}`))
        process.exit()
    }
}

module.exports = { getToken };