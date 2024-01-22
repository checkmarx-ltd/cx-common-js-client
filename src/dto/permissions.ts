export class Permissions {
    saveSastScan =false;
    manageResultsComment = false;
    manageResultsNotExploitabel = false;

    public constructor(saveSastScan : boolean, manageResultsComment : boolean,  manageResultsNotExploitabel :boolean) {
        this.saveSastScan = saveSastScan;
        this.manageResultsComment = manageResultsComment;
        this.manageResultsNotExploitabel = manageResultsNotExploitabel;
    }

    public isSaveSastScan() : boolean {
        return this.saveSastScan;
    }

    public isManageResultsComment() :boolean {
        return this.manageResultsComment;
    }

    public isManageResultsNotExploitabel() :boolean {
        return this.manageResultsNotExploitabel;
    }

}
