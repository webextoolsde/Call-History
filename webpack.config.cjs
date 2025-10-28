const path = require("path");

const config = {
  mode: "production",
  entry: "./src/call-history.js",
  output: {
    path: path.resolve(__dirname, "src/build"),
    filename: "bundle.js",
    publicPath: "build/"
  },
  module: {
    rules: [
      {
        use: "babel-loader",
        test: /\.js$/
      }
    ]
  }
};

module.exports = config;
