export class Permissions {
    saveSastScan =false;
    manageResultsComment = false;
    manageResultsNotExploitabel = false;
    manageResultsToVerify = false;
    manageResultsConfirmed = false;
    manageResultsUrgent = false;
    manageResultsProposedNotExploitable = false;
    manageResultsAccepted = false;

    public constructor(saveSastScan : boolean, manageResultsComment : boolean,  
        manageResultsNotExploitabel :boolean, manageResultsToVerify :boolean,
        manageResultsConfirmed :boolean,manageResultsUrgent :boolean,
        manageResultsProposedNotExploitable :boolean,manageResultsAccepted :boolean) {
        this.saveSastScan = saveSastScan;
        this.manageResultsComment = manageResultsComment;
        this.manageResultsNotExploitabel = manageResultsNotExploitabel;
        this.manageResultsToVerify = manageResultsToVerify;
        this.manageResultsConfirmed = manageResultsConfirmed;
        this.manageResultsUrgent = manageResultsUrgent;
        this.manageResultsProposedNotExploitable = manageResultsProposedNotExploitable;
        this.manageResultsAccepted = manageResultsAccepted;
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

    public isManageResultsToVerify() :boolean {
        return this.manageResultsToVerify;
    }

    public isManageResultsConfirmed() :boolean {
        return this.manageResultsConfirmed;
    }

    public isManageResultsUrgent() :boolean {
        return this.manageResultsUrgent;
    }

    public isManageResultsProposednotexploitable() :boolean {
        return this.manageResultsProposedNotExploitable;
    }

    public isManageResultsAccepted() :boolean {
        return this.manageResultsAccepted;
    }
}