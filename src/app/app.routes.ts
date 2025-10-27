import { ActivatedRouteSnapshot, RouterStateSnapshot, Routes } from '@angular/router';
import { EditorPage } from './editor/editor.page';
import { inject } from '@angular/core';
import { EditorStateService } from './services/editor-state.service';

export const editorResolver = (route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
  return inject(EditorStateService).loadProjectFromLocalStorage();
};

export const routes: Routes = [{ path: '', resolve: [editorResolver], component: EditorPage }];
