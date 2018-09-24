const request = require ('request-promise');
const chalk = require ('chalk')

const protocol = 'https://'
const hostname = 'api.cloogy.com'
const path = '/api/1.4'
const baseURI = `${protocol}${hostname}${path}`;


// awaits for the tokens and asks for a list of tags. Optional params query the server
async function getTags(token, where, order) {

    // const token = await auth.getToken();
    let requestOptions = {
        uri: baseURI + '/tags',
        method: 'GET',
        headers: {
            "Authorization": "ISA "+ token
        },
        qs: { 
            where: undefined,
            order: undefined
        },
        json: true
    };
    if (where) {
        requestOptions.qs.where = where
    }
    if (order) {
        requestOptions.qs.order = order
    }
    let response = await request(requestOptions)
    .then(response => {
        return (response.List)
        })
    .catch (error => {
        console.log(token)
        console.log(chalk.redBright.bold.underline(`Error (request tags): ${error}`))
        process.exit()
    })
    return response
}


module.exports = { getTags }