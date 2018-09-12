const baseURI = 'https://api.cloogy.com/api/1.4';
const request = require ('request-promise');

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
        console.log(error)
    }
}

module.exports = { getToken };