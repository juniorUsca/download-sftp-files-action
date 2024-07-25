import path from 'node:path'
import fs from 'node:fs'
import core from '@actions/core'

import { Client, type SFTPWrapper, type ConnectConfig } from 'ssh2'
import { type FileToDownload } from './types'

const remoteDirPath = core.getInput('remote-dir-path')
const localDirPath = core.getInput('local-dir-path')
const host = core.getInput('host')
const port = +core.getInput('port')
const username = core.getInput('username')
const password = core.getInput('password')
const filenames = core.getInput('filenames')
const filePatterns = core.getInput('file-patterns')
const failIfNoFiles = core.getInput('fail-if-no-files') === 'true'

const filesToDownload = filenames
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

console.log(`It will be attempted to download the files with the following patterns: ${filePatterns}`)
console.log(`It will be attempted to download the files with the following filenames: ${filenames}`)

const executeAction = (conn: Client, sftp: SFTPWrapper, listToDownload: FileToDownload[], position: number) => {
  const item = listToDownload.at(position)
  if (!item) {
    conn.end()
    return
  }
  console.log(`Downloading ${item.remotePath} to ${item.localPath}`)

  // normal download
  sftp.fastGet(item.remotePath, item.localPath, errFastGet => {
    if (errFastGet) {
      console.log(`Error downloading file: ${item.remotePath} to ${item.localPath}`)
      conn.end()
      core.setFailed(errFastGet.message)
      throw errFastGet
    }
    console.log(`Downloaded to ${item.localPath} ✅`)

    executeAction(conn, sftp, listToDownload, position + 1)
  })

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
          return filesToDownload.some(fileInput => fileInput === file.filename)
        })
        .filter(file => {
          return filePatternsToDownload.some(pattern => file.filename.match(pattern) !== null)
        })
        .map(file => ({
          filename: file.filename,
          localPath: path.join(localDirPath, file.filename),
          remotePath: path.posix.join(remoteDirPath, file.filename),
        }))

      core.setOutput('filenames', listToDownload.map(file => file.filename).join(', '))
      core.setOutput('filepaths', JSON.stringify(
        listToDownload.map(file => path.join(localDirPath, file.filename))
      ))

      if (listToDownload.length === 0) {
        console.log('No files to download')
        console.log('Files in remote directory:', allFiles.map(file => file.filename).join(', '))

        conn.end()
        if (failIfNoFiles){
          core.setFailed('No files to download')
        }
        return
      }

      console.log('Number of files to download:', listToDownload.length)
      console.log('Files to download:', listToDownload.map(file => file.filename).join(', '))
      console.log('Downloading files...')

      executeAction(conn, sftp, listToDownload, 0)
    })

  })
})
conn.on('error', err => {
  console.error(`Error caught, ${err}`)
  core.setFailed(err.message)
  throw err
})
conn.connect(credentials)
