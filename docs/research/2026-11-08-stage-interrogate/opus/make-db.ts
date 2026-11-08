// Makes one fresh test database with db/migrations/ applied and prints its URL for the user harness_app.
import { freshDatabase, withUser } from '../../../../tests/db'
const db = await freshDatabase()
console.log(withUser(db.url, 'harness_app'))
