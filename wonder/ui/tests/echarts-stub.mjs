export const setPlatformAPI = () => {}

export const init = host => ({
  resize: () => {},
  setOption: option => host.textContent = (option?.series || []).flatMap(series => series.data || [])
    .map(item => item?.name ?? item?.value ?? item).join(' '),
  dispose: () => host.replaceChildren()
})
