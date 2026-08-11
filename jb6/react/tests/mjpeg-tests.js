import { coreUtils, dsls, ns } from '@jb6/core'
import './react-testers.js'

const { 
  test: { Test, 
      'ui-action': { click, longPress, actions, waitForText },
      test: { dataTest, reactTest }
  }, 
  react: { ReactComp, 
    'react-comp': { comp },
  }
} = dsls

Test('mjpegTest.zoomInOut', {
  doNotRunInTests: true,
  impl: reactTest(({}, {react: {h}}) => () => 
    h('div', {},
      h('h3:text-lg font-bold mb-2', {}, 'MJPEG Zoom In/Out Stream'),
      h('img:border-2 border-gray-300 rounded-lg', { src: '/mjpeg.helloWorldZoom' }),
      h('p:mt-2 text-gray-600', {}, 'Live MJPEG stream showing zoom animation')
    ))
})

Test('mjpegTest.itemsView', {
  doNotRunInTests: true,
  impl: reactTest(({}, {react: {h}}) => () => 
    h('div', {},
      h('h3:text-lg font-bold mb-2', {}, 'MJPEG Items Explorer'),
      h('div:flex gap-5 flex-wrap', {},
        h('div', {},
          h('h4:font-semibold mb-1', {}, 'Live Stream (MJPEG)'),
          h('img:border-2 border-gray-300 rounded-lg', { src: '/mjpeg.itemsView' })
        ),
        h('div', {},
          h('h4:font-semibold mb-1', {}, 'Video (MP4)'),
          h('video:w-[400px] border-2 border-gray-300 rounded-lg', { src: '/mp4.itemsView', controls: true, autoPlay: true, loop: true }),
          h('a:inline-block mt-2 px-5 py-2 bg-blue-500 text-white no-underline rounded', { href: '/mp4.itemsView', download: 'itemsView.mp4' }, 'Download MP4')
        )
      )
    ))
})

Test('mjpegTest.mp4.itemsView', {
  doNotRunInTests: true,
  impl: reactTest(({}, {react: {h}}) => () => 
    h('div', {},
      h('h3:text-lg font-bold mb-2', {}, 'Items View MP4'),
      h('video:w-[400px] rounded-lg', { src: '/mp4.itemsView', controls: true, autoPlay: true, loop: true }),
      h('a:inline-block mt-2 text-blue-500 underline', { href: '/mp4.itemsView', download: 'itemsView.mp4' }, 'Download')
    ))
})