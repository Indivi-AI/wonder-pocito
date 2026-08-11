import 'dotenv/config'
import { createApp } from './app.js'

const port = Number(process.env.PORT || 8080)
(await createApp()).listen(port, '0.0.0.0')
