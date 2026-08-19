import { dsls } from '@jb6/core'
import '@jb6/testing'
import '@wonder/db/tests/db-drivers-testers.js'
import '@wonder/db/db-drivers-signed-room.js'

const { Test, test: { signedRoomPutGetTest, signedRoomAppendTest, signedRoomPermissionsTest, signedRoomGooglePermissionsTest,
  signedRoomUsersRWTest, signedRoomMediaPutGetTest, signedRoomSigningTest, signedRoomListTest, signedRoomTrailingSlashGetTest } } = dsls.test

Test('signedRoomDbDriverTests.liveRepo.mediaPutGet', { nodeOnly: true, impl: signedRoomMediaPutGetTest('staging') })
Test('signedRoomDbDriverTests.liveRepo.signing', { nodeOnly: true, impl: signedRoomSigningTest() })
Test('signedRoomDbDriverTests.liveRepo.permissions', { nodeOnly: true, impl: signedRoomPermissionsTest('staging') })
Test('signedRoomDbDriverTests.liveRepo.googlePermissions', { nodeOnly: true, impl: signedRoomGooglePermissionsTest('staging') })
Test('signedRoomDbDriverTests.liveRepo.putGet', { nodeOnly: true, impl: signedRoomPutGetTest('staging') })
Test('signedRoomDbDriverTests.liveRepo.append', { nodeOnly: true, impl: signedRoomAppendTest('staging') })
Test('signedRoomDbDriverTests.liveRepo.usersRW', { nodeOnly: true, impl: signedRoomUsersRWTest('staging') })
Test('signedRoomDbDriverTests.liveRepo.list', { nodeOnly: true, impl: signedRoomListTest('staging') })
Test('signedRoomDbDriverTests.liveRepo.trailingSlashGet', { nodeOnly: true, impl: signedRoomTrailingSlashGetTest('staging') })
