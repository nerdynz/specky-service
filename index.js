import path from 'path'

export default function SpeckyService (moduleOptions) {
  // Write your code here

  this.addPlugin({
    src: path.resolve(__dirname, 'plugin.js'),
  })
}