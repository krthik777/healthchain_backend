const MultiChain = require('multichain-node');

const connection = {
    port: process.env.MULTICHAIN_RPC_PORT || 8570,
    host: process.env.MULTICHAIN_RPC_HOST || 'localhost',
    user: process.env.MULTICHAIN_RPC_USER || 'multichainrpc',
    pass: process.env.MULTICHAIN_RPC_PASSWORD
};

const multichain = MultiChain(connection);

// Promisify MultiChain methods for async/await
const multiChainPromise = (method, params = []) => {
    return new Promise((resolve, reject) => {
        multichain[method](params, (err, res) => {
            if (err) reject(err);
            else resolve(res);
        });
    });
};

module.exports = { multichain, multiChainPromise };