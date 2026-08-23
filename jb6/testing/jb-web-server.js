import express from 'express'
import dotenv from 'dotenv'
import { expressProxy, expressRedirect } from '@jb6/server-utils/proxy.js'
dotenv.config()
import { expressTestServices } from './express-testing-utils.js'
const app = express()
const port = process.env.PORT || 8083
expressTestServices(app)
expressProxy(app)
expressRedirect(app)

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`)
})
