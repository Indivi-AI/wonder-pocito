import { dsls } from '@jb6/core'
import '@jb6/react'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

const ROOMS = [
  ['Wonder Publish', 'room://wonder-publish', [
    ['Applets', 'applets', [['Generic Agents UI', 'GenericAgentsUI.json'], ['Generic Agents Studio', 'GenericAgentsStudio.json']]],
    ['Booklets', 'booklets', [['kickDoclet', 'kickDoclet.json']]],
    ['Room Lambdas', 'lambdas', [['sendEmail', 'sendEmail.json']]],
    ['Agents', 'agents', [['Talk With Hipster', 'TalkWithHipster.json']]]]],
  ['110', 'room://110', [
    ['Applets', 'applets', [['Hunt-with-AI', 'Hunt-with-AI.json'], ['Generic Agents UI (110 tweak)', 'GenericAgentsUI.110.json']]],
    ['Booklets', 'booklets', [['kickDoclet.110', 'kickDoclet.110.json']]],
    ['Agents', 'agents', [['Talk With Hipster', 'TalkWithHipster.json']]]]],
  ['Private Room', 'signedRoom://private-room', [
    ['Agents', 'agents', [['Talk With Hipster', 'TalkWithHipster.json']]],
    ['Crons', 'crons', [['Every morning, summarize', 'every-morning-summarize.json']]]]]
]

const TREE = ROOMS.flatMap(([room, roomWUrl, dirs]) => [{ cls: 'root', prefix: '', glyph: '📁', text: room, wUrl: roomWUrl },
  ...dirs.flatMap(([dir, dirPath, files], di) => {
    const lastDir = di == dirs.length - 1
    return [{ cls: 'dir', prefix: lastDir ? '└── ' : '├── ', glyph: '📁', text: dir, wUrl: `${roomWUrl}/${dirPath}/` },
      ...files.map(([file, fileName], fi) => ({ cls: '', glyph: '📄', text: file, wUrl: `${roomWUrl}/${dirPath}/${fileName}`,
        prefix: `${lastDir ? '    ' : '│   '}${fi == files.length - 1 ? '└── ' : '├── '}` }))]
  })])

ReactComp('idfRoomsAssetsViz', {
  impl: comp({
    hFunc: (ctx, { react: { h, useState } }) => () => {
      const [wUrl, setWUrl] = useState(TREE[0].wUrl)
      return h('div:iv', {}, h('div:iv-title', {}, 'Rooms Assets and wUrls'),
        h('div:tree', {}, ...TREE.map(({ cls, prefix, glyph, text, wUrl: rowWUrl }) =>
          h(`div:tree-row ${cls}`, { key: rowWUrl + text, className: wUrl == rowWUrl ? 'on' : '', onClick: () => setWUrl(rowWUrl) },
            h('span:tree-prefix', {}, prefix), `${glyph} ${text}`))),
        h('div:tree-wurl', {}, h('div', {}, wUrl),
          h('div:tree-wurl-server', {}, wUrl.replace(/^\w+:\/\//, 'https://wonder.new/room/'))),
        h('div:tree-note', {}, 'Everything is readable and editable via the wonder MCP'))
    }
  })
})
