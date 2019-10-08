import React from 'react';
import './Page.scss'
import $ from 'jquery';
import showdown from 'showdown';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import _ from 'lodash';
import marked from 'marked';
import Shelf from './Shelf';
import shortid from 'shortid';
import stringify from 'json-stringify-deterministic';
import md5 from 'md5';

class Page extends React.Component {
  constructor(props) {
    super(props);

    this.sync = this.sync.bind(this);
    this.debouncedSync = _.debounce(this.sync, 5000);

    TurndownService.prototype.escape = text => text; // disable escaping characters
    this.turndownService = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced' });
    this.turndownService.use(gfm);
    marked.setOptions({
      smartLists: true,
    })
  }

  sync() {
    console.log('syncing');
    let lines = [];
    $('#m2-page > *').each((i, el) => {
      if(!el.id) {
        el.id = shortid.generate();
        this.doc[el.id] = this.turndownService.turndown(el.outerHTML);
      }
      lines.push(el.id);
    })

    const sel = window.getSelection();
    let caretAt = $(sel.anchorNode).closest('#m2-page > *').attr('id');

    localStorage.setItem('document_name', JSON.stringify({ doc: this.doc, lines, caretAt }));

    // sync to gdrive

    // get metadata. if local matches version, update new.
    // if remote is ahead, fast forward
    _.chunk(lines.map(id => ({ id, text: this.doc[id]})), 5).map(page => {
      const pageContent = stringify(page);
      const hash = md5(pageContent);
      console.log(hash);
      //TODO if hash does not exist in google drive, save it. if there are stale hashes, remove them
    });
  }

  componentDidMount() {
    if(localStorage.getItem('document_name')) {
      const data = JSON.parse(localStorage.getItem('document_name'));
      this.doc = data.doc;
      document.querySelector('#m2-page').innerHTML = marked(data.lines.map(l => this.doc[l]).join('\n'))
      Array.from(document.querySelector('#m2-page').children).forEach((el, i) => {
        el.id = data.lines[i];
      });
      window.getSelection().collapse(document.getElementById(data.caretAt), 0);
      this.sync();
    } else {
      this.doc = {};
    }


    let selectedBlock;
    $('#m2-page').on('keyup keydown mouseup', (e) => {
      this.debouncedSync();

      let oldSelectedBlock;
      if(selectedBlock) {
        oldSelectedBlock = selectedBlock;
      }

      let sel = window.getSelection();
      console.log('selection:');
      console.log(sel);
      console.log('anchorNode:');
      console.log(sel.anchorNode);
      const originalAnchorText = (sel.anchorNode && sel.anchorNode.data) ? sel.anchorNode.data.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&') : 0;
      selectedBlock = $(sel.anchorNode).closest('#m2-page > *');
      console.log('selectedBlock:');
      console.log(selectedBlock);

      if(e.key === 'Enter' && e.type === 'keydown') {
        e.preventDefault();

        // if the current line is not empty, prevent default and continue the string in a newline
        if(selectedBlock && selectedBlock[0] && !(sel.anchorNode.data === '\n\u200B' || (sel.anchorNode.tagName === 'BR'))) {
        console.log(e);

        let range;
        if(sel.getRangeAt && sel.rangeCount) {
            range = sel.getRangeAt(0);
            range.deleteContents();
            range.insertNode(document.createTextNode('\n\u200B'));
            sel.anchorNode.nextSibling && sel.collapse(sel.anchorNode.nextSibling, sel.anchorNode.nextSibling.length);
        }
        } else {
          // if the line is empty, start a new paragraph
          const newBlock = $(`<div id=${shortid.generate()}><br /></div>`);
          newBlock.insertAfter(selectedBlock);
          sel.collapse(newBlock[0], 0);
        }
      }


      // enter edit mode, showing markdown
      console.log(selectedBlock.data('editMode'));
      if(selectedBlock && selectedBlock[0] && !selectedBlock.data('editMode')) {
        console.log('markdown:');
        console.log(selectedBlock[0] && this.turndownService.turndown(selectedBlock[0].outerHTML));

        console.log('selection before toggling to edit');
        console.log(sel)
        const anchorOffset = sel.anchorOffset;
        let renderedMarkdown;
        if(selectedBlock.attr('id')) {
          renderedMarkdown = this.doc[selectedBlock.attr('id')];
        } else {
          renderedMarkdown = this.turndownService.turndown(selectedBlock[0].outerHTML) || '<br />'
        }
        selectedBlock.html(renderedMarkdown);
        console.log('selection after toggling to edit');
        console.log(sel)
        var range = document.createRange();
        let offset;
        if(selectedBlock[0].firstChild && selectedBlock[0].firstChild.data) {
          const stringMatch = selectedBlock[0].firstChild.data.match(new RegExp(originalAnchorText));
          const stringIndex = stringMatch ? stringMatch.index : 0;
          offset = stringIndex + anchorOffset;
        } else {
          offset = 0;
        }
        range.setStart(selectedBlock[0].firstChild, Math.min(offset, selectedBlock[0].firstChild.length));
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        selectedBlock.data('editMode', true);
        selectedBlock.css('white-space', 'pre');
        //selectedBlock.css('background-color', '#fafafa');
      }

      // render the old node upon exit
      if(oldSelectedBlock && oldSelectedBlock[0] && selectedBlock && selectedBlock[0] && !oldSelectedBlock[0].isSameNode(selectedBlock[0])) {
        console.log('rendered markdown:')
        let markdown = oldSelectedBlock[0].innerText.replace(/\u200B/g, '');
        console.log(markdown);
        console.log('html:');
        let html = marked(markdown);
        console.log(html);
        const renderedNode = $(html.replace(/\\/g, '') || '<div><br /></div>');
        let id = oldSelectedBlock.attr('id');
        if(!id) {
          id = shortid.generate();
        }
        renderedNode.attr('id', id);
        this.doc[id] = markdown;
        console.log(this.doc);
        oldSelectedBlock.replaceWith(renderedNode);
      }

      // fixes bug with contenteditable where you completely empty the div if the document is empty
      if (e.key === 'Backspace' || e.key === 'Delete') {
          if(!document.querySelector('#m2-page > *')) {
            document.querySelector('#m2-page').innerHTML = `<div id="${shortid.generate()}"><br /></div>`;
          }
      }
    });
  }

  render() {
    return <div><div id="m2-page" className="m2-page content" contentEditable="true">
    <h1>beef</h1>
    <div>cow</div>
    </div>
    <Shelf handleLogout={this.props.handleLogout} handleSwitchUser={this.props.handleSwitchUser} gapi={this.props.gapi} tryItNow={this.props.tryItNow} />
  </div>
  }
}

export default Page;
