import path from 'node:path'
import fs from 'node:fs'
import * as core from '@actions/core'

import { Client, type SFTPWrapper, type ConnectConfig } from 'ssh2'
import { type FileToDownload } from './types'

const remoteDirPath = core.getInput('remote-dir-path')
const localDirPath = core.getInput('local-dir-path')
const host = core.getInput('host')
const port = +core.getInput('port')
const username = core.getInput('username')
const password = core.getInput('password')
const fileNames = core.getInput('file-names')
const filePatterns = core.getInput('file-patterns')
const failIfNoFiles = core.getInput('fail-if-no-files') === 'true'

const filesToDownload = fileNames
  .split(',')
  .map(filename => filename.trim())
  .filter(filename => filename !== '')

const filePatternsToDownload = filePatterns
  .split(',')
  .map(filePattern => filePattern.trim())
  .filter(filePattern => filePattern !== '')
  .map(filePattern => new RegExp(filePattern))

const credentials: ConnectConfig = {
  host,
  port,
  username,
  password,
}

console.log(`It will be attempted to download the files with the following file-patterns: ${filePatterns}`)
console.log(`It will be attempted to download the files with the following file-names: ${fileNames}`)

if (filesToDownload.length === 0 && filePatternsToDownload.length === 0) {
  console.log('No files provided to download')
  console.log('Please provide at least one file name or file pattern to download')
  core.setFailed('No files provided to download')
  throw new Error('No files provided to download')
}

const executeAction = (conn: Client, sftp: SFTPWrapper, listToDownload: FileToDownload[], position: number, method: 'normal' | 'stream' = 'normal') => {
  const item = listToDownload.at(position)
  if (!item) {
    conn.end()
    return
  }
  console.log(`Downloading ${item.remotePath} to ${item.localPath}`)

  // normal download
  if (method === 'normal') {
    sftp.fastGet(item.remotePath, item.localPath, errFastGet => {
      if (errFastGet) {
        console.log(`Error downloading file: ${item.remotePath} to ${item.localPath} using fastGet`)

        console.error(errFastGet)

        console.log('Trying download using stream')

        executeAction(conn, sftp, listToDownload, position, 'stream')
        return

        // conn.end()
        // core.setFailed(errFastGet.message)
        // throw errFastGet
      }

      console.log(`Downloaded to ${item.localPath} using fastGet ✅`)
      executeAction(conn, sftp, listToDownload, position + 1, method)
    })
  }
  if (method === 'stream') {
    const wtr = fs.createWriteStream(item.localPath, { autoClose: true })
    const rdr = sftp.createReadStream(item.remotePath, { autoClose: true })
    rdr.once('error', (err: Error) => {
      console.error('Error downloading file: ' + err)
      conn.end()
      core.setFailed(err.message)
      throw err
    })
    rdr.once('error', (err: Error) => {
      console.error('Error writing file: ' + err)
      conn.end()
      core.setFailed(err.message)
      throw err
    })
    rdr.once('end', () => {
      console.log(`Downloaded to ${item.localPath} using stream ✅`)
      executeAction(conn, sftp, listToDownload, position + 1, method)
    })
    rdr.pipe(wtr)
  }

  // victor download method
  // sftp.readFile(remoteFile, (err, data) => {
  //   if (err) throw err
  //   fs.writeFile(localFile, data, (err) => {
  //     if (err) throw err
  //     console.log('Downloaded to ' + localFile)
  //     count--
  //     if (count <= 0) {
  //       conn.end()
  //     }
  //   })
  // })

  // download file using stream
  // const wtr = fs.createWriteStream(localFile, { autoClose: true })
  // const rdr = sftp.createReadStream(remoteFile, { autoClose: true })
  // rdr.once('error', (err) => {
  //   console.error('Error downloading file: ' + err)
  //   count--
  //   if (count <= 0) {
  //     conn.end()
  //   }
  // })
  // wtr.once('error', (err) => {
  //   console.error('Error writing file: ' + err)
  //   count--
  //   if (count <= 0) {
  //     conn.end()
  //   }
  // })
  // rdr.once('end', () => {
  //   console.log('Downloaded to ' + localFile)
  //   count--
  //   if (count <= 0) {
  //     conn.end()
  //   }
  // })
  // rdr.pipe(wtr)
}

const conn = new Client()
conn.on('ready', () => {
  console.log('SFTP Client :: ready')
  conn.sftp((err, sftp) => {
    if (err){
      core.setFailed(err.message)
      throw err
    }

    sftp.readdir(remoteDirPath, (errReadDir, allFiles) => {
      if (errReadDir){
        conn.end()
        core.setFailed(errReadDir.message)
        throw errReadDir
      }

      const listToDownload: FileToDownload[] = allFiles
        .filter(file => {
          const inFileNames = filesToDownload.some(fileInput => fileInput === file.filename)
          const inFilePatterns = filePatternsToDownload.some(pattern => file.filename.match(pattern) !== null)
          return inFileNames || inFilePatterns
        })
        .map(file => ({
          filename: file.filename,
          localPath: path.join(localDirPath, file.filename),
          remotePath: path.posix.join(remoteDirPath, file.filename),
        }))

      const listNotFound = filesToDownload.filter(fileInput => !listToDownload.some(file => file.filename === fileInput))

      core.setOutput('file-names', JSON.stringify(
        listToDownload.map(file => file.filename)
      ))
      core.setOutput('file-paths', JSON.stringify(
        listToDownload.map(file => path.join(localDirPath, file.filename))
      ))
      core.setOutput('file-names-not-found', JSON.stringify(
        listNotFound
      ))

      if (listNotFound.length > 0) {
        console.log('Some file names were not found in the remote directory')
        // console.log('Files in remote directory:', allFiles.map(file => file.filename).join(', '))
        // console.log('Files to download:', listToDownload.map(file => file.filename).join(', '))
        console.log('Files not found:', listNotFound.join(', '))

        if (failIfNoFiles) {
          console.log('Failing the action because some file names were not found in the remote directory')
          core.setFailed('Some file names were not found in the remote directory')
        }
      }

      if (listToDownload.length === 0) {
        console.log('No files to download')
        console.log(`Files in remote directory: ${remoteDirPath}`, allFiles.map(file => file.filename).join(', '))

        conn.end()
        if (failIfNoFiles){
          core.setFailed('No files to download')
        }
        return
      }

      console.log('Number of files to download:', listToDownload.length)
      console.log('Files to download:', listToDownload.map(file => file.filename).join(', '))
      console.log('Downloading files...')

      executeAction(conn, sftp, listToDownload, 0, 'normal')
    })

  })
})
conn.on('error', err => {
  console.error(`Error caught, ${err}`)
  core.setFailed(err.message)
  throw err
})
conn.connect(credentials)
