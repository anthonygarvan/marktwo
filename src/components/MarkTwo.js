import React from 'react';
import moment from 'moment';
import Shelf from './Shelf';
import shortid from 'shortid';
import Doc from './Doc';
import './MarkTwo.scss';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import syncUtils from './syncUtils';
import { faEdit, faCheck, faTimes, faTrash, faTrashRestore } from '@fortawesome/free-solid-svg-icons';

class MarkTwo extends React.Component {
  constructor(props) {
    super(props);

    this.openFile = this.openFile.bind(this);
    this.startNewFile = this.startNewFile.bind(this);
    this.handleImport = this.handleImport.bind(this);
    this.toggleTrash = this.toggleTrash.bind(this);
    this.sync = this.sync.bind(this);

    let appData;
    if(localStorage.getItem('appData')) {
      appData = JSON.parse(localStorage.getItem('appData'));
    } else {
      const currentDoc = shortid.generate();
      appData = { currentDoc, files: [ {id: currentDoc, title: false, lastModified: new Date()} ], revision: 0 };
    }

    localStorage.setItem('appData', JSON.stringify(appData));

    this.state = {
      newTitle: false,
      ...appData,
      gapi: this.props.gapi,
    };

  }

  componentDidMount() {
    this.syncUtils = syncUtils(this.state.gapi);

    const appData = JSON.parse(localStorage.getItem('appData'));
    this.syncUtils.find('appData', file => {
      if(file) {
        console.log(file);
      } else {
        this.syncUtils.create('appData', appData, response => {
          console.log(response);
          appData.fileId = response.id;
          this.sync(appData);
        });
      }
    })
  }

  sync(appData) {
    appData.revision = appData.revision + 1;
    this.setState({ ...appData });
    localStorage.setItem('appData', JSON.stringify(appData));
    this.syncUtils.find('appData', remoteAppData => {
      if(remoteAppData.revision > appData.revision) {
        localStorage.setItem('appData', JSON.stringify(appData));
      } else {
        this.syncUtils.update(appData.fileId, appData, result => console.log(result));
      }
    });
  }

  openFile(id) {
    const appData = JSON.parse(localStorage.getItem('appData'));
    appData.currentDoc = id;
    this.setState({ showFiles: false });
    this.sync(appData);
  }

  startNewFile() {
   const appData = JSON.parse(localStorage.getItem('appData'));
   const id = shortid.generate();
   appData.files.unshift({ id, title: false, lastModified: new Date() });
   this.setState({ showFiles: false, initialData: false });
   this.sync(appData);
  }

  setTitle(id, title) {
    const appData = JSON.parse(localStorage.getItem('appData'));
    appData.file = appData.files.map(f => {
      if(f.id === id) {
        f.title = this.state.newTitle;
      }
    });
    this.setState({ newTitle: false, editTitle: false });
    this.sync(appData);
  }

  handleImport(e) {
    console.log(e.target.files);
    const reader = new FileReader();
    reader.onload = (e) => {
      console.log(e.target.result);
      const appData = JSON.parse(localStorage.getItem('appData'));
      const id = shortid.generate();
      appData.files.unshift({ id, title: false, lastModified: new Date() });
      this.setState({ initialData: e.target.result, showFiles: false });
      this.sync(appData);
    }
    reader.readAsText(e.target.files[0]);
  }

  toggleTrash(id) {
    const appData = JSON.parse(localStorage.getItem('appData'));
    appData.file = appData.files.map(f => {
      if(f.id === id) {
        f.trashed = !f.trashed;
      }
    });
    this.setState({ newTitle: false, editTitle: false });
    this.sync(appData);
  }

  render() {
    return <div>
    <Doc key={this.state.currentDoc}
      currentDoc={this.state.currentDoc}
      gapi={this.props.gapi}
      handleLogout={this.props.handleLogout}
      handleSwitchUser={this.props.handleSwitchUser}
      tryItNow={this.props.tryItNow}
      initialData={this.state.initialData} />
    <Shelf handleLogout={this.props.handleLogout}
      handleSwitchUser={this.props.handleSwitchUser}
      gapi={this.props.gapi}
      tryItNow={this.props.tryItNow}
      showFiles={(val) => this.setState({ showFiles: val, viewTrash: false })} />

    <div className={`m2-files modal ${this.state.showFiles && 'is-active'}`}>
    <div className="modal-background" onClick={() => this.setState({showFiles: false})}></div>
      <div className="modal-card">
      <header className="modal-card-head">
        <p className="modal-card-title">Files</p>
        <button className="delete" aria-label="close" onClick={() => this.setState({showFiles: false})}></button>
      </header>
      <section className="modal-card-body">
        <div>
          <label className="m2-import">
            <span className="button is-text is-clear">Import</span>
            <input type="file" onChange={this.handleImport} accept=".txt,.md" />
          </label>
          <button className="button is-outline" onClick={this.startNewFile}>New</button></div>
        <table className="table is-striped is-fullwidth">
          <thead>
            <tr>
              <th><abbr title="File name">Name</abbr></th>
              <th><abbr title="Last modified">Last modified</abbr></th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {this.state.files.filter(f => (!!f.trashed == this.state.viewTrash)).map(f =>
              <tr key={f.id}>
                <td>{this.state.editTitle !== f.id ? <span><a onClick={() => this.openFile(f.id)}>{f.title ? <abbr title={f.title}>{f.title.substring(0,20)}</abbr>: 'Untitled'}</a>
                <a className="is-pulled-right" onClick={() => this.setState({ editTitle: f.id, newTitle: f.title })}> <FontAwesomeIcon icon={faEdit} /></a></span>
                : <span><input value={this.state.newTitle || ''} placeholder="Untitled" onChange={(e) => this.setState({ newTitle: e.target.value })}/>
                <span className="is-pulled-right"><a onClick={() => this.setTitle(f.id)}><FontAwesomeIcon icon={faCheck} /></a> &nbsp;&nbsp;
                <a onClick={() => this.setState({ editTitle: false, newTitle: false })}><FontAwesomeIcon icon={faTimes} /></a></span></span>}
                </td>
                <td>{moment(f.lastModified).fromNow()}</td>
                <td><a onClick={() => this.toggleTrash(f.id)}><FontAwesomeIcon icon={this.state.viewTrash ? faTrashRestore : faTrash} /></a></td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="m2-footer">
          <a onClick={() => this.setState({ viewTrash: !this.state.viewTrash })}>{this.state.viewTrash ? 'View files' : 'View trash'}</a>
        </div>
      </section>
    </div>
    </div></div>
  }
}

export default MarkTwo
