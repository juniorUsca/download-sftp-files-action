# Download Sftp Files Action

This action downloads files from a remote server using SFTP.

## Inputs

### `host`

**Required** The host of the remote server.

### `port`

**Required** The port of the remote server.

### `username`

**Required** The username of the remote server.

### `password`

**Required** The password of the remote server.

### `filenames`

The filenames to download from the remote server, separated by commas. Default is ``.
Example: `registry.json,package.json`

### `file-patterns`

The file patterns to download from the remote server, separated by commas. Default is ``.
Example: `^registry.*\.json$,^package.*\.json$`

### `remote-dir-path`

**Required** The remote directory path to download files from.

### `local-dir-path`

**Required** The local directory path to download files to. Default is `.`.

### `fail-if-no-files`

Whether to fail if files are not found. Default is `'false'`. To Activate, set to `'true'`.


## Outputs

### `filenames`

The filenames that were attempted to be downloaded. Separated by commas.

### `file-paths`

The file paths of the downloaded files in local server. Array of strings.

## Example usage

```yaml
uses: actions/download-sftp-files@v1
with:
  host: 'example.com'
  port: '22'
  username: 'user'
  password: 'password'
  filenames: 'registry.json,package.json'
  remote-dir-path: '/path/to/remote/dir'
  local-dir-path: '/path/to/local/dir'
  fail-if-no-files: 'true'
```
