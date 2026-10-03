// Tests for the serverless API (api/). Plain Node environment -- no browser setup.
// Run with:  npx jest -c jest.api.config.js
module.exports = {
    testEnvironment: 'node',
    roots: ['<rootDir>/api'],
    testMatch: ['**/__tests__/**/*.spec.js'],
};
