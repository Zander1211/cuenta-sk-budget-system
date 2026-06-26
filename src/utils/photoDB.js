export const initPhotoDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('CuentaPhotosDB', 1)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = (e) => {
      const db = e.target.result
      if (!db.objectStoreNames.contains('photos')) {
        const store = db.createObjectStore('photos', { keyPath: 'id' })
        store.createIndex('project_id', 'project_id', { unique: false })
      }
    }
  })
}

export const savePhoto = async (photo) => {
  const db = await initPhotoDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('photos', 'readwrite')
    const store = tx.objectStore('photos')
    const request = store.put(photo)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export const getPhotosByProject = async (projectId) => {
  const db = await initPhotoDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('photos', 'readonly')
    const store = tx.objectStore('photos')
    const index = store.index('project_id')
    const request = index.getAll(projectId)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export const deletePhoto = async (id) => {
  const db = await initPhotoDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('photos', 'readwrite')
    const store = tx.objectStore('photos')
    const request = store.delete(id)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}
